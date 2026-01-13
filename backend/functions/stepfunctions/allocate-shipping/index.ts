import { Handler } from 'aws-lambda';
import {
  OrderRepository,
  OrderStatus,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

const orderRepo = new OrderRepository();

interface AllocateShippingInput {
  orderId: string;
  paymentId: string;
  amount: number;
}

interface AllocateShippingOutput {
  orderId: string;
  status: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string;
}

/**
 * Allocate Shipping Step Function Task
 * Generates tracking number and allocates carrier
 */
export const handler: Handler<AllocateShippingInput, AllocateShippingOutput> = async (
  event
): Promise<AllocateShippingOutput> => {
  const { orderId, paymentId } = event;

  logger.setContext({ orderId });
  logger.info('Allocating shipping for order');

  // Get order
  const order = await orderRepo.getById(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Check if already processed
  if (order.status !== OrderStatus.PAYMENT_CONFIRMED) {
    logger.info('Order not in correct status', { status: order.status });
    throw new Error(`Order must be in PAYMENT_CONFIRMED status, currently: ${order.status}`);
  }

  // TODO: integrate with shipping provider API?
  // const shipment = await shippo.transactions.create({
  //   shipment: {...},
  //   carrier_account: 'usps_account',
  //   servicelevel_token: 'usps_priority',
  // });

  // Mock shipping allocation
  await new Promise((resolve) => setTimeout(resolve, 800));

  const carriers = ['USPS', 'FedEx', 'UPS'];
  const carrier = carriers[Math.floor(Math.random() * carriers.length)];
  const trackingNumber = `${carrier.toUpperCase().slice(0, 2)}${Date.now()}${Math.floor(
    Math.random() * 1000
  )}`;

  // Calculate estimated delivery (3-5 business days)
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 3 + Math.floor(Math.random() * 3));
  const estimatedDelivery = deliveryDate.toISOString().split('T')[0];

  logger.info('Shipping allocated', {
    carrier,
    trackingNumber,
    estimatedDelivery,
  });

  // Update order status
  await orderRepo.update(orderId, {
    status: OrderStatus.SHIPPING_ALLOCATED,
    updatedAt: getCurrentTimestamp(),
  });

  logger.info('Shipping allocation completed', {
    orderId,
    trackingNumber,
  });

  return {
    orderId,
    status: OrderStatus.SHIPPING_ALLOCATED,
    trackingNumber,
    carrier,
    estimatedDelivery,
  };
};