import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { logger } from '../utils/logger';
import { Order, Inventory } from '../types';

/**
 * Event Publisher Service
 * Publishes domain events to EventBridge for downstream processing
 */

interface EventDetail {
  [key: string]: any;
}

interface PublishEventParams {
  source: string;
  detailType: string;
  detail: EventDetail;
}

export class EventPublisher {
  private client: EventBridgeClient;
  private eventBusName: string;

  constructor() {
    this.client = new EventBridgeClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });
    this.eventBusName = process.env.EVENT_BUS_NAME || 'ecommerce-events';
  }

  /**
   * Publish a generic event to EventBridge
   */
  async publish(params: PublishEventParams): Promise<void> {
    try {
      const command = new PutEventsCommand({
        Entries: [
          {
            Source: params.source,
            DetailType: params.detailType,
            Detail: JSON.stringify(params.detail),
            EventBusName: this.eventBusName,
          },
        ],
      });

      const response = await this.client.send(command);

      if (response.FailedEntryCount && response.FailedEntryCount > 0) {
        logger.error('Failed to publish event', null, {
          failedEntries: response.Entries,
          params,
        });
        throw new Error(`Failed to publish event: ${params.detailType}`);
      }

      logger.info('Event published successfully', {
        source: params.source,
        detailType: params.detailType,
        eventBusName: this.eventBusName,
      });
    } catch (error: any) {
      logger.error('Error publishing event', error, { params });
      throw error;
    }
  }

  /**
   * Publish order created event
   */
  async publishOrderCreated(order: Order): Promise<void> {
    await this.publish({
      source: 'ecommerce.orders',
      detailType: 'OrderCreated',
      detail: {
        orderId: order.orderId,
        customerId: order.customerId,
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt,
      },
    });
  }

  /**
   * Publish inventory reserved event
   */
  async publishInventoryReserved(data: {
    orderId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    reservedAt: string;
  }): Promise<void> {
    await this.publish({
      source: 'ecommerce.inventory',
      detailType: 'InventoryReserved',
      detail: data,
    });
  }

  /**
   * Publish inventory released event (order cancelled)
   */
  async publishInventoryReleased(data: {
    orderId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    releasedAt: string;
  }): Promise<void> {
    await this.publish({
      source: 'ecommerce.inventory',
      detailType: 'InventoryReleased',
      detail: data,
    });
  }

  /**
   * Publish payment confirmed event
   */
  async publishPaymentConfirmed(data: {
    orderId: string;
    paymentIntentId: string;
    amount: number;
    confirmedAt: string;
  }): Promise<void> {
    await this.publish({
      source: 'ecommerce.payments',
      detailType: 'PaymentConfirmed',
      detail: data,
    });
  }

  /**
   * Publish payment failed event
   */
  async publishPaymentFailed(data: {
    orderId: string;
    paymentIntentId?: string;
    reason: string;
    failedAt: string;
  }): Promise<void> {
    await this.publish({
      source: 'ecommerce.payments',
      detailType: 'PaymentFailed',
      detail: data,
    });
  }

  /**
   * Publish shipping allocated event
   */
  async publishShippingAllocated(data: {
    orderId: string;
    trackingNumber: string;
    carrier: string;
    warehouseId: string;
    allocatedAt: string;
  }): Promise<void> {
    await this.publish({
      source: 'ecommerce.shipping',
      detailType: 'ShippingAllocated',
      detail: data,
    });
  }

  /**
   * Publish order shipped event
   */
  async publishOrderShipped(data: {
    orderId: string;
    trackingNumber: string;
    carrier: string;
    shippedAt: string;
  }): Promise<void> {
    await this.publish({
      source: 'ecommerce.orders',
      detailType: 'OrderShipped',
      detail: data,
    });
  }

  /**
   * Publish order cancelled event
   */
  async publishOrderCancelled(data: {
    orderId: string;
    reason: string;
    cancelledAt: string;
  }): Promise<void> {
    await this.publish({
      source: 'ecommerce.orders',
      detailType: 'OrderCancelled',
      detail: data,
    });
  }

  /**
   * Publish notification event
   */
  async publishNotification(data: {
    orderId: string;
    customerId: string;
    type: 'email' | 'sms';
    template: string;
    data: Record<string, any>;
  }): Promise<void> {
    await this.publish({
      source: 'ecommerce.notifications',
      detailType: 'NotificationRequested',
      detail: data,
    });
  }
}
