import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  dynamoClient,
  handleDynamoDBError,
  withRetry,
  getCurrentTimestamp,
  getTableName,
  buildPaginatedResponse,
  generateId,
} from '../utils/dynamodb-client';
import {
  OrderEvent,
  OrderEventType,
  DynamoDBOrderEventItem,
  PaginatedResult,
  QueryOptions,
} from '../types';

export class OrderEventRepository {
  private tableName: string;

  constructor() {
    this.tableName = getTableName('ORDER_EVENTS_TABLE_NAME');
  }

  /**
   * Append a new event to the order's event log
   * Events are append-only and never modified
   */
  async append(
    orderId: string,
    eventType: OrderEventType,
    payload: Record<string, any>,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<OrderEvent> {
    const timestamp = getCurrentTimestamp();
    const eventId = generateId();

    const event: OrderEvent = {
      eventId,
      orderId,
      eventType,
      timestamp,
      payload,
      userId,
      metadata,
    };

    const item: DynamoDBOrderEventItem = {
      PK: orderId,
      SK: `${timestamp}#${eventId}`, // Composite sort key for time-ordered retrieval
      ...event,
    };

    try {
      await withRetry(() =>
        dynamoClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: item,
            // No condition - append-only, always allow
          })
        )
      );

      return event;
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Get all events for an order (chronological order)
   */
  async getByOrderId(
    orderId: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<OrderEvent>> {
    try {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :orderId',
          ExpressionAttributeValues: {
            ':orderId': orderId,
          },
          ScanIndexForward: options.scanIndexForward ?? true, // Chronological by default
          Limit: options.limit,
          ExclusiveStartKey: options.lastEvaluatedKey,
        })
      );

      const items = (response.Items || []).map((item) => {
        const { PK, SK, ...event } = item as DynamoDBOrderEventItem;
        return event as OrderEvent;
      });

      return buildPaginatedResponse(items, response.LastEvaluatedKey);
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Get events of a specific type for an order
   */
  async getByOrderIdAndType(
    orderId: string,
    eventType: OrderEventType,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<OrderEvent>> {
    try {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :orderId',
          FilterExpression: 'eventType = :eventType',
          ExpressionAttributeValues: {
            ':orderId': orderId,
            ':eventType': eventType,
          },
          ScanIndexForward: options.scanIndexForward ?? true,
          Limit: options.limit,
          ExclusiveStartKey: options.lastEvaluatedKey,
        })
      );

      const items = (response.Items || []).map((item) => {
        const { PK, SK, ...event } = item as DynamoDBOrderEventItem;
        return event as OrderEvent;
      });

      return buildPaginatedResponse(items, response.LastEvaluatedKey);
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Get the latest event for an order
   */
  async getLatest(orderId: string): Promise<OrderEvent | null> {
    try {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :orderId',
          ExpressionAttributeValues: {
            ':orderId': orderId,
          },
          ScanIndexForward: false, // Reverse chronological
          Limit: 1,
        })
      );

      if (!response.Items || response.Items.length === 0) {
        return null;
      }

      const { PK, SK, ...event } = response.Items[0] as DynamoDBOrderEventItem;
      return event as OrderEvent;
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Check if an event type exists for an order
   */
  async hasEventType(orderId: string, eventType: OrderEventType): Promise<boolean> {
    const result = await this.getByOrderIdAndType(orderId, eventType, { limit: 1 });
    return result.items.length > 0;
  }

  /**
   * Rebuild order state from events (Event Sourcing pattern)
   * This allows reconstructing order state at any point in time
   */
  async rebuildOrderState(orderId: string): Promise<{
    currentStatus: string;
    timeline: Array<{ timestamp: string; eventType: string; payload: any }>;
    summary: Record<string, any>;
  }> {
    const allEvents = await this.getByOrderId(orderId);
    const events = allEvents.items;

    const timeline = events.map((event) => ({
      timestamp: event.timestamp,
      eventType: event.eventType,
      payload: event.payload,
    }));

    // Derive current state from events
    let currentStatus = 'PENDING';
    const summary: Record<string, any> = {
      created: null,
      inventoryReserved: false,
      paymentConfirmed: false,
      shipped: false,
      delivered: false,
      cancelled: false,
    };

    events.forEach((event) => {
      switch (event.eventType) {
        case OrderEventType.ORDER_CREATED:
          summary.created = event.timestamp;
          currentStatus = 'PENDING';
          break;
        case OrderEventType.INVENTORY_RESERVED:
          summary.inventoryReserved = true;
          currentStatus = 'INVENTORY_RESERVED';
          break;
        case OrderEventType.PAYMENT_CONFIRMED:
          summary.paymentConfirmed = true;
          currentStatus = 'PAYMENT_CONFIRMED';
          break;
        case OrderEventType.ORDER_SHIPPED:
          summary.shipped = true;
          currentStatus = 'SHIPPED';
          break;
        case OrderEventType.ORDER_DELIVERED:
          summary.delivered = true;
          currentStatus = 'DELIVERED';
          break;
        case OrderEventType.ORDER_CANCELLED:
          summary.cancelled = true;
          currentStatus = 'CANCELLED';
          break;
        case OrderEventType.PAYMENT_FAILED:
          currentStatus = 'FAILED';
          break;
      }
    });

    return {
      currentStatus,
      timeline,
      summary,
    };
  }

  /**
   * Get event count for an order
   */
  async getEventCount(orderId: string): Promise<number> {
    const result = await this.getByOrderId(orderId);
    return result.items.length;
  }

  /**
   * Helper: Create common event types
   */
  async recordOrderCreated(
    orderId: string,
    orderData: Record<string, any>,
    userId?: string
  ): Promise<OrderEvent> {
    return this.append(orderId, OrderEventType.ORDER_CREATED, orderData, userId);
  }

  async recordInventoryReserved(
    orderId: string,
    inventoryData: Record<string, any>,
    userId?: string
  ): Promise<OrderEvent> {
    return this.append(orderId, OrderEventType.INVENTORY_RESERVED, inventoryData, userId);
  }

  async recordPaymentConfirmed(
    orderId: string,
    paymentData: Record<string, any>,
    userId?: string
  ): Promise<OrderEvent> {
    return this.append(orderId, OrderEventType.PAYMENT_CONFIRMED, paymentData, userId);
  }

  async recordOrderShipped(
    orderId: string,
    shippingData: Record<string, any>,
    userId?: string
  ): Promise<OrderEvent> {
    return this.append(orderId, OrderEventType.ORDER_SHIPPED, shippingData, userId);
  }

  async recordOrderCancelled(
    orderId: string,
    cancellationData: Record<string, any>,
    userId?: string
  ): Promise<OrderEvent> {
    return this.append(orderId, OrderEventType.ORDER_CANCELLED, cancellationData, userId);
  }
}
