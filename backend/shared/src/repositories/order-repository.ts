import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  dynamoClient,
  handleDynamoDBError,
  withRetry,
  getCurrentTimestamp,
  getTableName,
  buildUpdateExpression,
  buildPaginatedResponse,
} from '../utils/dynamodb-client';
import {
  Order,
  OrderStatus,
  DynamoDBOrderItem,
  PaginatedResult,
  QueryOptions,
} from '../types';

export class OrderRepository {
  private tableName: string;

  constructor() {
    this.tableName = getTableName('ORDERS_TABLE_NAME');
  }

  /**
   * Create a new order
   */
  async create(order: Omit<Order, 'createdAt' | 'updatedAt'>): Promise<Order> {
    const now = getCurrentTimestamp();
    const newOrder: Order = {
      ...order,
      createdAt: now,
      updatedAt: now,
    };

    const item: DynamoDBOrderItem = {
      PK: newOrder.orderId,
      ...newOrder,
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

      return newOrder;
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Get order by ID
   */
  async getById(orderId: string): Promise<Order | null> {
    try {
      const response = await dynamoClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: orderId },
        })
      );

      if (!response.Item) {
        return null;
      }

      const { PK, ...order } = response.Item as DynamoDBOrderItem;
      return order as Order;
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Update order status
   */
  async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const updates = {
      status,
      updatedAt: getCurrentTimestamp(),
    };

    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpdateExpression(updates);

    try {
      const response = await withRetry(() =>
        dynamoClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { PK: orderId },
            UpdateExpression,
            ExpressionAttributeNames,
            ExpressionAttributeValues,
            ConditionExpression: 'attribute_exists(PK)',
            ReturnValues: 'ALL_NEW',
          })
        )
      );

      const { PK, ...order } = response.Attributes as DynamoDBOrderItem;
      return order as Order;
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Update order with additional fields
   */
  async update(
    orderId: string,
    updates: Partial<Omit<Order, 'orderId' | 'createdAt'>>
  ): Promise<Order> {
    const updatesWithTimestamp = {
      ...updates,
      updatedAt: getCurrentTimestamp(),
    };

    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpdateExpression(updatesWithTimestamp);

    try {
      const response = await withRetry(() =>
        dynamoClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { PK: orderId },
            UpdateExpression,
            ExpressionAttributeNames,
            ExpressionAttributeValues,
            ConditionExpression: 'attribute_exists(PK)',
            ReturnValues: 'ALL_NEW',
          })
        )
      );

      const { PK, ...order } = response.Attributes as DynamoDBOrderItem;
      return order as Order;
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Get orders by customer ID
   */
  async getByCustomerId(
    customerId: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<Order>> {
    try {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'customerId-createdAt-index',
          KeyConditionExpression: 'customerId = :customerId',
          ExpressionAttributeValues: {
            ':customerId': customerId,
          },
          ScanIndexForward: options.scanIndexForward ?? false, // Newest first
          Limit: options.limit,
          ExclusiveStartKey: options.lastEvaluatedKey,
        })
      );

      const items = (response.Items || []).map((item) => {
        const { PK, ...order } = item as DynamoDBOrderItem;
        return order as Order;
      });

      return buildPaginatedResponse(items, response.LastEvaluatedKey);
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Get orders by status
   */
  async getByStatus(
    status: OrderStatus,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<Order>> {
    try {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'status-createdAt-index',
          KeyConditionExpression: 'status = :status',
          ExpressionAttributeValues: {
            ':status': status,
          },
          ScanIndexForward: options.scanIndexForward ?? false, // Newest first
          Limit: options.limit,
          ExclusiveStartKey: options.lastEvaluatedKey,
        })
      );

      const items = (response.Items || []).map((item) => {
        const { PK, ...order } = item as DynamoDBOrderItem;
        return order as Order;
      });

      return buildPaginatedResponse(items, response.LastEvaluatedKey);
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Delete order (soft delete by setting status)
   */
  async cancel(orderId: string): Promise<Order> {
    return this.updateStatus(orderId, OrderStatus.CANCELLED);
  }

  /**
   * Check if order exists
   */
  async exists(orderId: string): Promise<boolean> {
    const order = await this.getById(orderId);
    return order !== null;
  }
}
