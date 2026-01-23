import { Handler } from 'aws-lambda';
import {
  OrderRepository,
  IdempotencyService,
  OrderStatus,
  logger,
  getCurrentTimestamp,
  getPaymentIntent,
} from 'ecommerce-backend-shared';

const orderRepo = new OrderRepository();
const idempotency = new IdempotencyService();

interface ProcessPaymentInput {
  orderId: string;
  reservedItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    warehouseId: string;
  }>;
}

interface ProcessPaymentOutput {
  orderId: string;
  status: string;
  paymentId: string;
  amount: number;
}

/**
 * Process Payment Step Function Task
 * Verifies that payment has already been confirmed by the user on the frontend
 * (Payment was already processed via Stripe Elements and webhook confirmation)
 */
export const handler: Handler<ProcessPaymentInput, ProcessPaymentOutput> = async (
  event
): Promise<ProcessPaymentOutput> => {
  const { orderId } = event;

  logger.setContext({ orderId });
  logger.info('Verifying payment for order');

  // Get order
  const order = await orderRepo.getById(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Check if already processed
  if (order.status !== OrderStatus.INVENTORY_RESERVED) {
    logger.info('Order not in correct status', { status: order.status });
    throw new Error(`Order must be in INVENTORY_RESERVED status, currently: ${order.status}`);
  }

  // Verify payment with idempotency
  const paymentResult = await idempotency.executeOnce(
    IdempotencyService.generateOrderKey(orderId, 'payment-verification'),
    'verify-payment',
    async () => {
      logger.info('Verifying payment with Stripe', {
        paymentIntentId: order.paymentIntentId,
        orderId,
      });

      // Check that order has a paymentIntentId
      if (!order.paymentIntentId) {
        throw new Error('Order missing paymentIntentId - payment was not initiated');
      }

      try {
        // Retrieve the existing PaymentIntent from Stripe to verify its status
        const paymentIntent = await getPaymentIntent(order.paymentIntentId);

        // Verify payment succeeded
        if (paymentIntent.status !== 'succeeded') {
          throw new Error(
            `Payment verification failed: Expected status 'succeeded' but got '${paymentIntent.status}'`
          );
        }

        // Verify the amount matches
        if (paymentIntent.amount !== order.totalAmount) {
          logger.warn('Payment amount mismatch', {
            expected: order.totalAmount,
            actual: paymentIntent.amount,
          });
          throw new Error(
            `Payment amount mismatch: Expected ${order.totalAmount}, got ${paymentIntent.amount}`
          );
        }

        logger.info('Payment verified successfully', {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          status: paymentIntent.status,
        });

        return {
          paymentId: paymentIntent.id,
          amount: paymentIntent.amount,
          status: 'succeeded',
          paymentMethod: paymentIntent.payment_method as string,
        };
      } catch (error: any) {
        logger.error('Payment verification failed', error, {
          orderId,
          paymentIntentId: order.paymentIntentId,
        });

        // Throw error to trigger compensation
        throw new Error(`Payment verification failed: ${error.message}`);
      }
    }
  );

  // Update order status to PAYMENT_CONFIRMED
  await orderRepo.update(orderId, {
    status: OrderStatus.PAYMENT_CONFIRMED,
    updatedAt: getCurrentTimestamp(),
  });

  logger.info('Payment verification completed', {
    orderId,
    paymentId: paymentResult.paymentId,
  });

  return {
    orderId,
    status: OrderStatus.PAYMENT_CONFIRMED,
    paymentId: paymentResult.paymentId,
    amount: paymentResult.amount,
  };
};