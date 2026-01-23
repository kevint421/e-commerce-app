import { Handler } from 'aws-lambda';
import {
  OrderRepository,
  logger,
  sendOrderConfirmationEmail,
  OrderConfirmationData,
} from 'ecommerce-backend-shared';

const orderRepo = new OrderRepository();

interface SendNotificationInput {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string;
}

interface SendNotificationOutput {
  orderId: string;
  notificationSent: boolean;
  emailSent: boolean;
}

/**
 * Send Notification Step Function Task
 * Sends order confirmation email to customer via Amazon SES
 */
export const handler: Handler<SendNotificationInput, SendNotificationOutput> = async (
  event
): Promise<SendNotificationOutput> => {
  const { orderId, trackingNumber, carrier, estimatedDelivery } = event;

  logger.setContext({ orderId });
  logger.info('Sending order confirmation notification', {
    trackingNumber,
    carrier,
  });

  // Get order
  const order = await orderRepo.getById(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Extract customer email from customerId or use configured test email
  // In production, you would fetch the actual customer email from a Users table
  const customerEmail = process.env.TEST_CUSTOMER_EMAIL || `${order.customerId}@example.com`;

  // Prepare email data
  const emailData: OrderConfirmationData = {
    orderId: order.orderId,
    customerEmail,
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      pricePerUnit: item.pricePerUnit,
      totalPrice: item.totalPrice,
    })),
    totalAmount: order.totalAmount,
    shippingAddress: order.shippingAddress,
    trackingNumber,
    carrier,
    estimatedDelivery,
  };

  try {
    // Send email via Amazon SES
    await sendOrderConfirmationEmail(emailData);

    logger.info('Order confirmation email sent successfully', {
      orderId,
      customerEmail,
    });

    return {
      orderId,
      notificationSent: true,
      emailSent: true,
    };
  } catch (error: any) {
    logger.error('Failed to send order confirmation email', error, {
      orderId,
      customerEmail,
      errorCode: error.code,
    });

    // Don't fail the saga if email fails - just log and continue
    // In production, you might want to retry or send to a DLQ
    return {
      orderId,
      notificationSent: false,
      emailSent: false,
    };
  }
};