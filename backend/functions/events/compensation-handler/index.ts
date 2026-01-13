import { Handler } from 'aws-lambda';
import {
  OrderRepository,
  InventoryRepository,
  OrderStatus,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

// Initialize repositories
const orderRepo = new OrderRepository();
const inventoryRepo = new InventoryRepository();

interface CompensationInput {
  orderId: string;
  failedStep: string; // Which step failed: 'INVENTORY' | 'PAYMENT' | 'SHIPPING'
  error: string;
  orderData?: any; // Original order data for context
}

interface CompensationOutput {
  success: boolean;
  orderId: string;
  compensatedSteps: string[];
  finalStatus: string;
}

/**
 * Compensation Handler Lambda
 * Rolls back completed steps when a failure occurs in the saga
 * 
 * Compensation logic:
 * - If payment failed → Release reserved inventory
 * - If shipping failed → Refund payment + Release inventory
 * - Always update order status to CANCELLED
 * - Always record compensation events
 */
export const handler: Handler<CompensationInput, CompensationOutput> = async (
  event
): Promise<CompensationOutput> => {
  const { orderId, failedStep, error } = event;

  logger.setContext({ orderId, failedStep });
  logger.info('Starting compensation', { error });

  const compensatedSteps: string[] = [];

  try {
    // Get current order state
    const order = await orderRepo.getById(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    logger.info('Current order status', { status: order.status });

    // Determine what needs to be compensated based on current status and failed step
    const needsInventoryRelease = 
      order.status === OrderStatus.INVENTORY_RESERVED ||
      order.status === OrderStatus.PAYMENT_CONFIRMED ||
      order.status === OrderStatus.SHIPPING_ALLOCATED;

    const needsPaymentRefund =
      order.status === OrderStatus.PAYMENT_CONFIRMED ||
      order.status === OrderStatus.SHIPPING_ALLOCATED;

    // 1. Refund payment if it was confirmed
    if (needsPaymentRefund) {
      await refundPayment(orderId, order);
      compensatedSteps.push('PAYMENT_REFUNDED');
    }

    // 2. Release reserved inventory
    if (needsInventoryRelease) {
      await releaseInventory(orderId, order);
      compensatedSteps.push('INVENTORY_RELEASED');
    }

    // 3. Update order status to CANCELLED
    await orderRepo.update(orderId, {
      status: OrderStatus.CANCELLED,
      updatedAt: getCurrentTimestamp(),
    });

    // 4. Record cancellation event
    logger.info('Compensation completed successfully', {
      compensatedSteps,
      finalStatus: OrderStatus.CANCELLED,
    });

    return {
      success: true,
      orderId,
      compensatedSteps,
      finalStatus: OrderStatus.CANCELLED,
    };
  } catch (compensationError: any) {
    logger.error('Compensation failed', compensationError);
    
    return {
      success: false,
      orderId,
      compensatedSteps,
      finalStatus: 'COMPENSATION_FAILED',
    };
  }
};

/**
 * Refund payment
 */
async function refundPayment(orderId: string, order: any): Promise<void> {
  logger.info('Refunding payment', { orderId, amount: order.totalAmount });

  // Check if payment was actually processed
  if (!order.paymentIntentId) {
    logger.warn('No payment intent to refund', { orderId });
    return;
  }

  try {
    // Create refund in Stripe
    const refund = await createRefund(
      order.paymentIntentId,
      'requested_by_customer'
    );

    logger.info('Payment refunded successfully with Stripe', {
      orderId,
      refundId: refund.id,
      amount: refund.amount,
      status: refund.status,
    });

    // Update order with refund status
    await orderRepo.update(orderId, {
      paymentStatus: 'refunded',
      updatedAt: getCurrentTimestamp(),
    });
  } catch (error: any) {
    logger.error('Failed to refund payment', error, { orderId, paymentIntentId: order.paymentIntentId });
    // Don't throw, still want to continue with other compensation steps
  }
}

/**
 * Release reserved inventory
 * Decrements reserved count and increments available count
 */
async function releaseInventory(orderId: string, order: any): Promise<void> {
  logger.info('Releasing inventory', { orderId, itemCount: order.items.length });

  // Release inventory for each item
  for (const item of order.items) {
    const { productId, quantity, warehouseId } = item;

    try {
      // Get current inventory
      const inventory = await inventoryRepo.get(
        productId,
        warehouseId || 'warehouse-east' // Default warehouse
      );

      if (!inventory) {
        logger.warn('Inventory not found, skipping', { productId, warehouseId });
        continue;
      }

      // Release the reservation (increase available, decrease reserved)
      await inventoryRepo.release(
        productId,
        inventory.warehouseId,
        quantity,
        inventory.version
      );

      logger.info('Inventory released', {
        productId,
        warehouseId,
        quantity,
        previousReserved: inventory.reserved,
        newReserved: Math.max(0, inventory.reserved - quantity),
      });
    } catch (error: any) {
      logger.error('Failed to release inventory for item', error, {
        productId,
        quantity,
      });
      // Continue with other items even if one fails
    }
  }

  logger.info('All inventory released', { orderId });
}