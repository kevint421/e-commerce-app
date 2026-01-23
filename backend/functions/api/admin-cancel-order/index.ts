import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  OrderRepository,
  InventoryRepository,
  OrderStatus,
  logger,
  getCurrentTimestamp,
  createRefund,
} from 'ecommerce-backend-shared';

const orderRepo = new OrderRepository();
const inventoryRepo = new InventoryRepository();

/**
 * Admin: Cancel Order Lambda
 * POST /admin/orders/{orderId}/cancel
 *
 * Body:
 * {
 *   "reason": "admin_cancelled" | "customer_request" | "fraud" | "other"
 * }
 *
 * Actions:
 * 1. Cancel order (set status to CANCELLED)
 * 2. Refund payment if payment was confirmed
 * 3. Release reserved inventory
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const orderId = event.pathParameters?.orderId;

  if (!orderId) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'Order ID is required',
      }),
    };
  }

  logger.setContext({ orderId });
  logger.info('Admin: Cancelling order');

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const reason = body.reason || 'admin_cancelled';

    // Get order
    const order = await orderRepo.getById(orderId);
    if (!order) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Not Found',
          message: `Order ${orderId} not found`,
        }),
      };
    }

    // Check if order can be cancelled
    if (order.status === OrderStatus.CANCELLED) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Order is already cancelled',
        }),
      };
    }

    if (order.status === OrderStatus.SHIPPING_ALLOCATED) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Cannot cancel order that has already been shipped',
        }),
      };
    }

    const operations: string[] = [];

    // 1. Refund payment if confirmed
    if (order.paymentIntentId && order.paymentStatus === 'succeeded') {
      try {
        const refund = await createRefund(order.paymentIntentId, 'requested_by_customer');
        logger.info('Payment refunded', {
          refundId: refund.id,
          amount: refund.amount,
        });
        operations.push('payment_refunded');

        // Update payment status
        await orderRepo.updatePaymentInfo(orderId, {
          paymentStatus: 'refunded',
        });
      } catch (error: any) {
        logger.error('Failed to refund payment', error);
        // Continue with cancellation even if refund fails
        operations.push('payment_refund_failed');
      }
    }

    // 2. Release inventory if reserved
    if (order.status === OrderStatus.INVENTORY_RESERVED || order.status === OrderStatus.PAYMENT_CONFIRMED) {
      for (const item of order.items) {
        if (!item.warehouseId) {
          logger.warn('Item missing warehouseId, skipping inventory release', {
            productId: item.productId,
          });
          continue;
        }

        try {
          const inventory = await inventoryRepo.get(item.productId, item.warehouseId);
          if (inventory) {
            await inventoryRepo.release(
              item.productId,
              item.warehouseId,
              item.quantity,
              inventory.version
            );
            logger.info('Inventory released', {
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantity: item.quantity,
            });
          }
        } catch (error: any) {
          logger.error('Failed to release inventory', error, {
            productId: item.productId,
            warehouseId: item.warehouseId,
          });
          // Continue with other items
        }
      }
      operations.push('inventory_released');
    }

    // 3. Update order status to CANCELLED
    const updatedOrder = await orderRepo.update(orderId, {
      status: OrderStatus.CANCELLED,
      updatedAt: getCurrentTimestamp(),
      metadata: {
        ...order.metadata,
        cancelReason: reason,
        cancelledBy: 'admin',
        cancelledAt: getCurrentTimestamp(),
      },
    });

    operations.push('order_cancelled');

    logger.info('Order cancelled successfully', {
      orderId,
      operations,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Order cancelled successfully',
        orderId,
        operations,
        order: updatedOrder,
        timestamp: getCurrentTimestamp(),
      }),
    };
  } catch (error: any) {
    logger.error('Failed to cancel order', error);

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
