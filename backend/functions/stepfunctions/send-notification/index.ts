import { Handler } from 'aws-lambda';
import {
  OrderRepository,
  logger,
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
 * Sends order confirmation email to customer
 */
export const handler: Handler<SendNotificationInput, SendNotificationOutput> = async (
  event
): Promise<SendNotificationOutput> => {
  const { orderId, trackingNumber, carrier, estimatedDelivery } = event;

  logger.setContext({ orderId });
  logger.info('Sending order confirmation notification');

  // Get order
  const order = await orderRepo.getById(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Build email content
  const emailContent = {
    to: `customer-${order.customerId}@example.com`,
    subject: `Order Confirmation - ${orderId}`,
    body: `
      Your order has been confirmed!
      
      Order ID: ${orderId}
      Total: $${(order.totalAmount / 100).toFixed(2)}
      Items: ${order.items.length}
      
      Tracking Number: ${trackingNumber}
      Carrier: ${carrier}
      Estimated Delivery: ${estimatedDelivery}
      
      Shipping Address:
      ${order.shippingAddress.street}
      ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}
      
      Thank you for your order!
    `,
  };

  logger.info('Email content prepared', {
    to: emailContent.to,
    subject: emailContent.subject,
  });

  // TODO: In production, send real email via SES
  // await ses.sendEmail({
  //   Source: process.env.SES_FROM_EMAIL,
  //   Destination: { ToAddresses: [emailContent.to] },
  //   Message: {
  //     Subject: { Data: emailContent.subject },
  //     Body: { Text: { Data: emailContent.body } },
  //   },
  // });

  // Mock email sending
  await new Promise((resolve) => setTimeout(resolve, 300));

  logger.info('Notification sent successfully', {
    orderId,
    recipient: emailContent.to,
  });

  return {
    orderId,
    notificationSent: true,
    emailSent: true,
  };
};