import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  dynamoClient,
  handleDynamoDBError,
  withRetry,
  getCurrentTimestamp,
  getTableName,
  buildVersionCondition,
} from '../utils/dynamodb-client';
import {
  Inventory,
  DynamoDBInventoryItem,
  InventoryUpdateOptions,
  PaginatedResult,
  QueryOptions,
} from '../types';

export class InventoryRepository {
  private tableName: string;

  constructor() {
    this.tableName = getTableName('INVENTORY_TABLE_NAME');
  }

  /**
   * Create new inventory record
   */
  async create(inventory: Omit<Inventory, 'updatedAt'>): Promise<Inventory> {
    const now = getCurrentTimestamp();
    const newInventory: Inventory = {
      ...inventory,
      updatedAt: now,
      version: inventory.version || 0,
    };

    const item: DynamoDBInventoryItem = {
      PK: this.buildInventoryId(inventory.productId, inventory.warehouseId),
      ...newInventory,
    };

    try {
      await withRetry(() =>
        dynamoClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(PK)',
          })
        )
      );

      return newInventory;
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Get inventory by product and warehouse
   */
  async get(productId: string, warehouseId: string): Promise<Inventory | null> {
    const inventoryId = this.buildInventoryId(productId, warehouseId);

    try {
      const response = await dynamoClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: inventoryId },
        })
      );

      if (!response.Item) {
        return null;
      }

      const { PK, ...inventory } = response.Item as DynamoDBInventoryItem;
      // Ensure reserved attribute exists (backward compatibility)
      if (inventory.reserved === undefined) {
        inventory.reserved = 0;
      }
      return inventory as Inventory;
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Reserve inventory with optimistic locking
   * This is critical for preventing overselling
   */
  async reserve(
    productId: string,
    warehouseId: string,
    quantity: number,
    expectedVersion: number
  ): Promise<Inventory> {
    const inventoryId = this.buildInventoryId(productId, warehouseId);

    try {
      const response = await withRetry(() =>
        dynamoClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { PK: inventoryId },
            UpdateExpression:
              'SET reserved = if_not_exists(reserved, :zero) + :qty, version = version + :one, updatedAt = :now',
            ExpressionAttributeValues: {
              ':qty': quantity,
              ':one': 1,
              ':now': getCurrentTimestamp(),
              ':expectedVersion': expectedVersion,
              ':zero': 0,
            },
            // Use attribute_exists OR handle missing reserved by checking if attribute exists
            ConditionExpression:
              'version = :expectedVersion AND attribute_exists(PK) AND ' +
              '(attribute_not_exists(reserved) OR (quantity - reserved >= :qty))',
            ReturnValues: 'ALL_NEW',
          })
        )
      );

      const { PK, ...inventory } = response.Attributes as DynamoDBInventoryItem;
      return inventory as Inventory;
    } catch (error: any) {
      // Check if it's an optimistic locking conflict
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(
          `Inventory reservation failed: Concurrent modification detected or insufficient stock. ` +
            `Product: ${productId}, Warehouse: ${warehouseId}, Requested: ${quantity}`
        );
      }
      return handleDynamoDBError(error);
    }
  }

  /**
   * Release reserved inventory (e.g., order cancelled or payment failed)
   */
  async release(
    productId: string,
    warehouseId: string,
    quantity: number,
    expectedVersion: number
  ): Promise<Inventory> {
    const inventoryId = this.buildInventoryId(productId, warehouseId);

    try {
      const response = await withRetry(() =>
        dynamoClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { PK: inventoryId },
            UpdateExpression:
              'SET reserved = if_not_exists(reserved, :zero) - :qty, version = version + :one, updatedAt = :now',
            ExpressionAttributeValues: {
              ':qty': quantity,
              ':one': 1,
              ':now': getCurrentTimestamp(),
              ':expectedVersion': expectedVersion,
              ':zero': 0,
            },
            ConditionExpression:
              'version = :expectedVersion AND attribute_exists(PK) AND ' +
              '(attribute_not_exists(reserved) OR reserved >= :qty)',
            ReturnValues: 'ALL_NEW',
          })
        )
      );

      const { PK, ...inventory } = response.Attributes as DynamoDBInventoryItem;
      return inventory as Inventory;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(
          `Inventory release failed: Concurrent modification detected or insufficient reserved quantity. ` +
            `Product: ${productId}, Warehouse: ${warehouseId}, Requested: ${quantity}`
        );
      }
      return handleDynamoDBError(error);
    }
  }

  /**
   * Confirm shipment - move from reserved to shipped (reduce reserved count)
   */
  async confirmShipment(
    productId: string,
    warehouseId: string,
    quantity: number,
    expectedVersion: number
  ): Promise<Inventory> {
    const inventoryId = this.buildInventoryId(productId, warehouseId);

    try {
      const response = await withRetry(() =>
        dynamoClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { PK: inventoryId },
            UpdateExpression:
              'SET reserved = if_not_exists(reserved, :zero) - :qty, version = version + :one, updatedAt = :now',
            ExpressionAttributeValues: {
              ':qty': quantity,
              ':one': 1,
              ':now': getCurrentTimestamp(),
              ':expectedVersion': expectedVersion,
              ':zero': 0,
            },
            ConditionExpression:
              'version = :expectedVersion AND attribute_exists(PK) AND ' +
              '(attribute_not_exists(reserved) OR reserved >= :qty)',
            ReturnValues: 'ALL_NEW',
          })
        )
      );

      const { PK, ...inventory } = response.Attributes as DynamoDBInventoryItem;
      return inventory as Inventory;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(
          `Shipment confirmation failed: Concurrent modification detected or insufficient reserved quantity. ` +
            `Product: ${productId}, Warehouse: ${warehouseId}, Requested: ${quantity}`
        );
      }
      return handleDynamoDBError(error);
    }
  }

  /**
   * Update inventory quantity (restocking)
   */
  async restock(
    productId: string,
    warehouseId: string,
    quantityToAdd: number,
    expectedVersion: number
  ): Promise<Inventory> {
    const inventoryId = this.buildInventoryId(productId, warehouseId);

    try {
      const response = await withRetry(() =>
        dynamoClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { PK: inventoryId },
            UpdateExpression:
              'SET quantity = quantity + :qty, version = version + :one, updatedAt = :now',
            ExpressionAttributeValues: {
              ':qty': quantityToAdd,
              ':one': 1,
              ':now': getCurrentTimestamp(),
              ':expectedVersion': expectedVersion,
            },
            ConditionExpression: 'version = :expectedVersion',
            ReturnValues: 'ALL_NEW',
          })
        )
      );

      const { PK, ...inventory } = response.Attributes as DynamoDBInventoryItem;
      return inventory as Inventory;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(
          `Restock failed: Concurrent modification detected. ` +
            `Product: ${productId}, Warehouse: ${warehouseId}`
        );
      }
      return handleDynamoDBError(error);
    }
  }

  /**
   * Get all inventory for a product across all warehouses
   */
  async getByProductId(
    productId: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<Inventory>> {
    try {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'productId-warehouseId-index',
          KeyConditionExpression: 'productId = :productId',
          ExpressionAttributeValues: {
            ':productId': productId,
          },
          Limit: options.limit,
          ExclusiveStartKey: options.lastEvaluatedKey,
        })
      );

      const items = (response.Items || []).map((item) => {
        const { PK, ...inventory } = item as DynamoDBInventoryItem;
        // Ensure reserved attribute exists (backward compatibility)
        if (inventory.reserved === undefined) {
          inventory.reserved = 0;
        }
        return inventory as Inventory;
      });

      return {
        items,
        lastEvaluatedKey: response.LastEvaluatedKey,
        hasMore: !!response.LastEvaluatedKey,
      };
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Get total available quantity across all warehouses
   */
  async getTotalAvailableQuantity(productId: string): Promise<number> {
    const result = await this.getByProductId(productId);
    return result.items.reduce((total, inv) => total + (inv.quantity - (inv.reserved || 0)), 0);
  }

  /**
   * Find warehouse with sufficient stock
   */
  async findWarehouseWithStock(
    productId: string,
    requiredQuantity: number
  ): Promise<Inventory | null> {
    const result = await this.getByProductId(productId);

    // Find first warehouse with sufficient available stock (quantity - reserved)
    const warehouse = result.items.find((inv) => (inv.quantity - (inv.reserved || 0)) >= requiredQuantity);

    return warehouse || null;
  }

  /**
   * Check if sufficient stock exists
   */
  async hasStock(productId: string, quantity: number): Promise<boolean> {
    const totalStock = await this.getTotalAvailableQuantity(productId);
    return totalStock >= quantity;
  }

  /**
   * Helper: Build inventory ID
   */
  private buildInventoryId(productId: string, warehouseId: string): string {
    return `${productId}#${warehouseId}`;
  }
}
