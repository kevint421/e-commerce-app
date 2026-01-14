import { Handler } from 'aws-lambda';
import {
  OrderRepository,
  IdempotencyService,
  OrderStatus,
  logger,
  getCurrentTimestamp,
  createAndConfirmPayment,
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
 * Processes payment with idempotency to prevent double-charging
 */
export const handler: Handler<ProcessPaymentInput, ProcessPaymentOutput> = async (
  event
): Promise<ProcessPaymentOutput> => {
  const { orderId } = event;

  logger.setContext({ orderId });
  logger.info('Processing payment for order');

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

  // Process payment with idempotency
  const paymentResult = await idempotency.executeOnce(
    IdempotencyService.generateOrderKey(orderId, 'payment'),
    'process-payment',
    async () => {
      logger.info('Initiating payment with Stripe', {
        amount: order.totalAmount,
        customerId: order.customerId,
      });

      try {
        // Create and confirm payment with Stripe (synchronous flow)
        const paymentIntent = await createAndConfirmPayment(
          order.totalAmount,
          'usd',
          {
            orderId: order.orderId,
            customerId: order.customerId,
          }
        );

        // Check payment status
        if (paymentIntent.status !== 'succeeded') {
          throw new Error(
            `Payment failed with status: ${paymentIntent.status}`
          );
        }

        logger.info('Payment processed successfully with Stripe', {
          paymentIntentId: paymentIntent.id,
          amount: order.totalAmount,
          status: paymentIntent.status,
        });

        return {
          paymentId: paymentIntent.id,
          amount: order.totalAmount,
          status: 'succeeded',
          paymentMethod: paymentIntent.payment_method as string,
        };
      } catch (error: any) {
        logger.error('Payment processing failed', error, {
          orderId,
          amount: order.totalAmount,
        });
        
        // Throw error to trigger compensation
        throw new Error(`Payment failed: ${error.message}`);
      
      }
    }
  );

  // Update order status
  await orderRepo.update(orderId, {
    status: OrderStatus.PAYMENT_CONFIRMED,
    updatedAt: getCurrentTimestamp(),
  });

  logger.info('Payment processing completed', {
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