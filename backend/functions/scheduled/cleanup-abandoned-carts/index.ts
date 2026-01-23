import { Handler } from 'aws-lambda';
import {
  OrderRepository,
  InventoryRepository,
  OrderStatus,
  Order,
  logger,
  getCurrentTimestamp,
  sendAbandonedCartReminderEmail,
  AbandonedCartReminderData,
} from 'ecommerce-backend-shared';

const orderRepo = new OrderRepository();
const inventoryRepo = new InventoryRepository();

// Configurable timeout threshold (default: 30 minutes)
const ABANDONED_CART_TIMEOUT_MINUTES = parseInt(
  process.env.ABANDONED_CART_TIMEOUT_MINUTES || '30',
  10
);

// Send reminder email at 25 minutes (5 minutes before expiry)
const REMINDER_EMAIL_THRESHOLD_MINUTES = ABANDONED_CART_TIMEOUT_MINUTES - 5;

// Enable/disable reminder emails
const SEND_REMINDER_EMAILS = process.env.SEND_REMINDER_EMAILS === 'true';

interface CleanupResult {
  processedCount: number;
  successCount: number;
  failureCount: number;
  abandonedOrders: string[];
  remindersSent: number;
  errors: Array<{ orderId: string; error: string }>;
}

/**
 * Cleanup Abandoned Carts Lambda
 * Scheduled function that runs every 5-10 minutes to release inventory
 * for orders that have been in INVENTORY_RESERVED status for too long
 *
 * An order is considered abandoned if:
 * - Status is INVENTORY_RESERVED
 * - Payment status is 'pending'
 * - Created more than ABANDONED_CART_TIMEOUT_MINUTES ago
 */
export const handler: Handler<any, CleanupResult> = async (
  event
): Promise<CleanupResult> => {
  logger.info('Starting abandoned cart cleanup job', {
    timeoutMinutes: ABANDONED_CART_TIMEOUT_MINUTES,
  });

  const result: CleanupResult = {
    processedCount: 0,
    successCount: 0,
    failureCount: 0,
    abandonedOrders: [],
    remindersSent: 0,
    errors: [],
  };

  try {
    // Get all orders in INVENTORY_RESERVED status
    const reservedOrders = await getReservedOrders();
    logger.info('Found orders in INVENTORY_RESERVED status', {
      count: reservedOrders.length,
    });

    // Categorize orders by age
    const now = new Date();
    const abandonedOrders: Order[] = [];
    const ordersNeedingReminders: Order[] = [];

    for (const order of reservedOrders) {
      const createdAt = new Date(order.createdAt);
      const ageMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

      // Skip if payment is not pending
      if (order.paymentStatus !== 'pending') {
        continue;
      }

      // Check if order is old enough to cancel
      if (ageMinutes > ABANDONED_CART_TIMEOUT_MINUTES) {
        abandonedOrders.push(order);
      }
      // Check if order is old enough for reminder (and hasn't been sent)
      else if (
        SEND_REMINDER_EMAILS &&
        ageMinutes >= REMINDER_EMAIL_THRESHOLD_MINUTES &&
        !order.metadata?.reminderEmailSent
      ) {
        ordersNeedingReminders.push(order);
      }
    }

    logger.info('Categorized orders', {
      total: reservedOrders.length,
      abandoned: abandonedOrders.length,
      needingReminders: ordersNeedingReminders.length,
      timeoutMinutes: ABANDONED_CART_TIMEOUT_MINUTES,
    });

    // Send reminder emails first (before cancelling orders)
    for (const order of ordersNeedingReminders) {
      try {
        await sendReminderEmail(order);
        result.remindersSent++;
        logger.info('Sent abandoned cart reminder email', {
          orderId: order.orderId,
          age: getOrderAgeMinutes(order),
        });
      } catch (error: any) {
        logger.error('Failed to send reminder email', error, {
          orderId: order.orderId,
        });
        // Don't count as error - continue with cleanup
      }
    }

    // Process each abandoned order
    for (const order of abandonedOrders) {
      result.processedCount++;

      try {
        await processAbandonedOrder(order);
        result.successCount++;
        result.abandonedOrders.push(order.orderId);

        logger.info('Successfully cleaned up abandoned order', {
          orderId: order.orderId,
          age: getOrderAgeMinutes(order),
        });
      } catch (error: any) {
        result.failureCount++;
        result.errors.push({
          orderId: order.orderId,
          error: error.message,
        });

        logger.error('Failed to clean up abandoned order', error, {
          orderId: order.orderId,
        });
      }
    }

    logger.info('Abandoned cart cleanup completed', result);
    return result;
  } catch (error: any) {
    logger.error('Abandoned cart cleanup job failed', error);
    throw error;
  }
};

/**
 * Get all orders in INVENTORY_RESERVED status
 */
async function getReservedOrders(): Promise<Order[]> {
  try {
    // Query orders by status using the GSI
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');

    const client = DynamoDBDocumentClient.from(new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-2',
    }));

    const tableName = process.env.ORDERS_TABLE_NAME;
    if (!tableName) {
      throw new Error('ORDERS_TABLE_NAME environment variable not set');
    }

    const response = await client.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'status-createdAt-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': OrderStatus.INVENTORY_RESERVED,
        },
      })
    );

    const orders = (response.Items || []).map((item) => {
      const { PK, ...order } = item;
      return order as Order;
    });

    return orders;
  } catch (error: any) {
    logger.error('Failed to query reserved orders', error);
    throw error;
  }
}

/**
 * Process a single abandoned order
 * - Release all reserved inventory
 * - Update order status to CANCELLED
 */
async function processAbandonedOrder(order: Order): Promise<void> {
  logger.info('Processing abandoned order', {
    orderId: order.orderId,
    itemCount: order.items.length,
    ageMinutes: getOrderAgeMinutes(order),
  });

  // Release inventory for each item
  for (const item of order.items) {
    const { productId, quantity, warehouseId } = item;

    if (!warehouseId) {
      logger.warn('Order item missing warehouseId, skipping', {
        orderId: order.orderId,
        productId,
      });
      continue;
    }

    try {
      // Get current inventory to get the version
      const inventory = await inventoryRepo.get(productId, warehouseId);

      if (!inventory) {
        logger.warn('Inventory not found for abandoned order item', {
          orderId: order.orderId,
          productId,
          warehouseId,
        });
        continue;
      }

      // Release the reserved inventory
      await inventoryRepo.release(
        productId,
        warehouseId,
        quantity,
        inventory.version
      );

      logger.info('Inventory released for abandoned order', {
        orderId: order.orderId,
        productId,
        warehouseId,
        quantity,
      });
    } catch (error: any) {
      logger.error('Failed to release inventory for abandoned order item', error, {
        orderId: order.orderId,
        productId,
        warehouseId,
        quantity,
      });
      // Continue with other items
    }
  }

  // Update order status to CANCELLED
  await orderRepo.update(order.orderId, {
    status: OrderStatus.CANCELLED,
    updatedAt: getCurrentTimestamp(),
    metadata: {
      ...order.metadata,
      cancelReason: 'ABANDONED_CART',
      cancelledAt: getCurrentTimestamp(),
      abandonedAfterMinutes: getOrderAgeMinutes(order),
    },
  });

  logger.info('Order marked as cancelled (abandoned cart)', {
    orderId: order.orderId,
  });
}

/**
 * Send abandoned cart reminder email
 */
async function sendReminderEmail(order: Order): Promise<void> {
  logger.info('Sending abandoned cart reminder email', {
    orderId: order.orderId,
    age: getOrderAgeMinutes(order),
  });

  // Extract customer email (or use test email)
  const customerEmail = process.env.TEST_CUSTOMER_EMAIL || `${order.customerId}@example.com`;

  // Calculate minutes remaining
  const ageMinutes = getOrderAgeMinutes(order);
  const expiresInMinutes = ABANDONED_CART_TIMEOUT_MINUTES - ageMinutes;

  // Prepare checkout URL (would be dynamically generated in production)
  const checkoutUrl = `${process.env.FRONTEND_URL || 'https://yourstore.com'}/checkout?orderId=${order.orderId}`;

  const emailData: AbandonedCartReminderData = {
    orderId: order.orderId,
    customerEmail,
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      pricePerUnit: item.pricePerUnit,
    })),
    totalAmount: order.totalAmount,
    checkoutUrl,
    expiresInMinutes: Math.max(1, expiresInMinutes),
  };

  try {
    await sendAbandonedCartReminderEmail(emailData);

    // Mark order as having received reminder email
    await orderRepo.update(order.orderId, {
      metadata: {
        ...order.metadata,
        reminderEmailSent: true,
        reminderSentAt: getCurrentTimestamp(),
      },
      updatedAt: getCurrentTimestamp(),
    });

    logger.info('Abandoned cart reminder email sent successfully', {
      orderId: order.orderId,
      customerEmail,
    });
  } catch (error: any) {
    logger.error('Failed to send abandoned cart reminder email', error, {
      orderId: order.orderId,
      customerEmail,
    });
    throw error;
  }
}

/**
 * Calculate order age in minutes
 */
function getOrderAgeMinutes(order: Order): number {
  const now = new Date();
  const createdAt = new Date(order.createdAt);
  return Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60));
}
