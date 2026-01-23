import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  InventoryRepository,
  ProductRepository,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

const inventoryRepo = new InventoryRepository();
const productRepo = new ProductRepository();

/**
 * Admin: Update Inventory Lambda
 * PUT /admin/inventory/{productId}
 *
 * Body:
 * {
 *   "warehouseId": "warehouse-east",
 *   "quantity": 100,
 *   "operation": "set" | "add" | "subtract"
 * }
 *
 * Operations:
 * - set: Set quantity to exact value
 * - add: Add to current quantity (restock)
 * - subtract: Subtract from current quantity
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const productId = event.pathParameters?.productId;

  if (!productId) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'Product ID is required',
      }),
    };
  }

  logger.setContext({ productId });
  logger.info('Admin: Updating inventory');

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { warehouseId, quantity, operation = 'set' } = body;

    // Validate inputs
    if (!warehouseId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'warehouseId is required',
        }),
      };
    }

    if (typeof quantity !== 'number' || quantity < 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'quantity must be a non-negative number',
        }),
      };
    }

    if (!['set', 'add', 'subtract'].includes(operation)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'operation must be one of: set, add, subtract',
        }),
      };
    }

    // Verify product exists
    const product = await productRepo.getById(productId);
    if (!product) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Not Found',
          message: `Product ${productId} not found`,
        }),
      };
    }

    // Get current inventory
    let inventory = await inventoryRepo.get(productId, warehouseId);

    // If inventory doesn't exist, create it
    if (!inventory) {
      if (operation === 'set' || operation === 'add') {
        inventory = await inventoryRepo.create({
          productId,
          warehouseId,
          quantity: operation === 'set' ? quantity : quantity,
          reserved: 0,
          version: 0,
        });

        logger.info('Inventory created', {
          productId,
          warehouseId,
          quantity: inventory.quantity,
        });
      } else {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            error: 'Not Found',
            message: `Inventory not found for product ${productId} in ${warehouseId}`,
          }),
        };
      }
    } else {
      // Update existing inventory
      let newQuantity: number;

      switch (operation) {
        case 'set':
          newQuantity = quantity;
          break;
        case 'add':
          newQuantity = inventory.quantity + quantity;
          break;
        case 'subtract':
          newQuantity = Math.max(0, inventory.quantity - quantity);
          break;
        default:
          newQuantity = inventory.quantity;
      }

      // Calculate the delta for restock operation
      const delta = newQuantity - inventory.quantity;

      if (delta > 0) {
        // Restock (add inventory)
        inventory = await inventoryRepo.restock(
          productId,
          warehouseId,
          delta,
          inventory.version
        );
      } else if (delta < 0) {
        // Manual reduction (use custom update)
        const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
        const { dynamoClient, getTableName } = await import('ecommerce-backend-shared');

        const tableName = getTableName('INVENTORY_TABLE_NAME');
        const inventoryId = `${productId}#${warehouseId}`;

        const response = await dynamoClient.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { PK: inventoryId },
            UpdateExpression:
              'SET quantity = :newQty, version = version + :one, updatedAt = :now',
            ExpressionAttributeValues: {
              ':newQty': newQuantity,
              ':one': 1,
              ':now': getCurrentTimestamp(),
              ':expectedVersion': inventory.version,
            },
            ConditionExpression: 'version = :expectedVersion',
            ReturnValues: 'ALL_NEW',
          })
        );

        const { PK, ...updatedInventory } = response.Attributes as any;
        inventory = updatedInventory;
      }

      logger.info('Inventory updated', {
        productId,
        warehouseId,
        operation,
        oldQuantity: inventory.quantity - (delta || 0),
        newQuantity: inventory.quantity,
        delta,
      });
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Inventory updated successfully',
        inventory,
        product: {
          productId: product.productId,
          name: product.name,
        },
        timestamp: getCurrentTimestamp(),
      }),
    };
  } catch (error: any) {
    logger.error('Failed to update inventory', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: getCurrentTimestamp(),
      }),
    };
  }
};
