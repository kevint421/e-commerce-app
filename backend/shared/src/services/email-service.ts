import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { logger } from '../utils/logger';
import { Order } from '../types';

/**
 * Email Service
 * Manages email sending via Amazon SES
 */

// Cache SES client
let sesClient: SESClient | null = null;

/**
 * Get or create SES client
 */
function getSESClient(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });
  }
  return sesClient;
}

/**
 * Email template data interfaces
 */
export interface OrderConfirmationData {
  orderId: string;
  customerEmail: string;
  customerName?: string;
  items: Array<{
    productName: string;
    quantity: number;
    pricePerUnit: number;
    totalPrice: number;
  }>;
  totalAmount: number;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
}

export interface ShippingNotificationData {
  orderId: string;
  customerEmail: string;
  customerName?: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string;
  trackingUrl?: string;
}

export interface AbandonedCartReminderData {
  orderId: string;
  customerEmail: string;
  customerName?: string;
  items: Array<{
    productName: string;
    quantity: number;
    pricePerUnit: number;
  }>;
  totalAmount: number;
  checkoutUrl: string;
  expiresInMinutes: number;
}

/**
 * Send order confirmation email
 */
export async function sendOrderConfirmationEmail(
  data: OrderConfirmationData
): Promise<void> {
  const { customerEmail, orderId } = data;

  logger.info('Sending order confirmation email', {
    orderId,
    customerEmail,
  });

  const subject = `Order Confirmation - Order #${orderId}`;
  const htmlBody = generateOrderConfirmationHTML(data);
  const textBody = generateOrderConfirmationText(data);

  await sendEmail({
    to: customerEmail,
    subject,
    htmlBody,
    textBody,
  });

  logger.info('Order confirmation email sent', {
    orderId,
    customerEmail,
  });
}

/**
 * Send shipping notification email
 */
export async function sendShippingNotificationEmail(
  data: ShippingNotificationData
): Promise<void> {
  const { customerEmail, orderId } = data;

  logger.info('Sending shipping notification email', {
    orderId,
    customerEmail,
  });

  const subject = `Your Order Has Shipped - Order #${orderId}`;
  const htmlBody = generateShippingNotificationHTML(data);
  const textBody = generateShippingNotificationText(data);

  await sendEmail({
    to: customerEmail,
    subject,
    htmlBody,
    textBody,
  });

  logger.info('Shipping notification email sent', {
    orderId,
    customerEmail,
  });
}

/**
 * Send abandoned cart reminder email
 */
export async function sendAbandonedCartReminderEmail(
  data: AbandonedCartReminderData
): Promise<void> {
  const { customerEmail, orderId } = data;

  logger.info('Sending abandoned cart reminder email', {
    orderId,
    customerEmail,
  });

  const subject = `Don't Forget Your Items - Order #${orderId}`;
  const htmlBody = generateAbandonedCartReminderHTML(data);
  const textBody = generateAbandonedCartReminderText(data);

  await sendEmail({
    to: customerEmail,
    subject,
    htmlBody,
    textBody,
  });

  logger.info('Abandoned cart reminder email sent', {
    orderId,
    customerEmail,
  });
}

/**
 * Generic send email function
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}): Promise<void> {
  const { to, subject, htmlBody, textBody } = params;

  const fromEmail = process.env.SES_FROM_EMAIL || 'noreply@yourcompany.com';

  const ses = getSESClient();

  try {
    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8',
          },
          Text: {
            Data: textBody,
            Charset: 'UTF-8',
          },
        },
      },
    });

    await ses.send(command);
  } catch (error: any) {
    logger.error('Failed to send email via SES', error, {
      to,
      subject,
      errorCode: error.code,
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Generate HTML email for order confirmation
 */
function generateOrderConfirmationHTML(data: OrderConfirmationData): string {
  const { orderId, items, totalAmount, shippingAddress, trackingNumber, carrier, estimatedDelivery } = data;

  const itemsHTML = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${item.productName}</strong><br>
        <span style="color: #6b7280;">Qty: ${item.quantity}</span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        $${(item.totalPrice / 100).toFixed(2)}
      </td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #2563eb; padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Order Confirmed!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">
                Thank you for your order! We're processing it now.
              </p>

              <div style="background-color: #f9fafb; border-left: 4px solid #2563eb; padding: 16px; margin: 24px 0;">
                <p style="margin: 0; font-size: 14px; color: #6b7280;">Order Number</p>
                <p style="margin: 4px 0 0; font-size: 18px; font-weight: bold; color: #111827;">#${orderId.toUpperCase()}</p>
              </div>

              <!-- Order Items -->
              <h2 style="margin: 24px 0 16px; font-size: 20px; color: #111827;">Order Details</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 4px;">
                ${itemsHTML}
                <tr>
                  <td style="padding: 16px; font-weight: bold; font-size: 18px;">Total</td>
                  <td style="padding: 16px; text-align: right; font-weight: bold; font-size: 18px; color: #2563eb;">
                    $${(totalAmount / 100).toFixed(2)}
                  </td>
                </tr>
              </table>

              <!-- Shipping Address -->
              <h2 style="margin: 24px 0 16px; font-size: 20px; color: #111827;">Shipping Address</h2>
              <div style="background-color: #f9fafb; padding: 16px; border-radius: 4px;">
                <p style="margin: 0; color: #374151; line-height: 1.6;">
                  ${shippingAddress.street}<br>
                  ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postalCode}<br>
                  ${shippingAddress.country}
                </p>
              </div>

              ${trackingNumber ? `
              <!-- Tracking Info -->
              <h2 style="margin: 24px 0 16px; font-size: 20px; color: #111827;">Tracking Information</h2>
              <div style="background-color: #f0fdf4; border: 1px solid #86efac; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 8px; color: #166534;"><strong>Carrier:</strong> ${carrier}</p>
                <p style="margin: 0 0 8px; color: #166534;"><strong>Tracking Number:</strong> ${trackingNumber}</p>
                ${estimatedDelivery ? `<p style="margin: 0; color: #166534;"><strong>Estimated Delivery:</strong> ${estimatedDelivery}</p>` : ''}
              </div>
              ` : ''}

              <!-- Footer Message -->
              <p style="margin: 24px 0 0; font-size: 14px; color: #6b7280; text-align: center;">
                Questions? Contact us at support@yourcompany.com
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} E-Commerce Store. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Generate plain text email for order confirmation
 */
function generateOrderConfirmationText(data: OrderConfirmationData): string {
  const { orderId, items, totalAmount, shippingAddress, trackingNumber, carrier, estimatedDelivery } = data;

  const itemsText = items
    .map(
      (item) =>
        `  ${item.productName} (Qty: ${item.quantity}) - $${(item.totalPrice / 100).toFixed(2)}`
    )
    .join('\n');

  return `
ORDER CONFIRMED!

Thank you for your order! We're processing it now.

Order Number: #${orderId.toUpperCase()}

ORDER DETAILS:
${itemsText}

Total: $${(totalAmount / 100).toFixed(2)}

SHIPPING ADDRESS:
${shippingAddress.street}
${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postalCode}
${shippingAddress.country}

${trackingNumber ? `
TRACKING INFORMATION:
Carrier: ${carrier}
Tracking Number: ${trackingNumber}
${estimatedDelivery ? `Estimated Delivery: ${estimatedDelivery}` : ''}
` : ''}

Questions? Contact us at support@yourcompany.com

© ${new Date().getFullYear()} E-Commerce Store. All rights reserved.
  `.trim();
}

/**
 * Generate HTML email for shipping notification
 */
function generateShippingNotificationHTML(data: ShippingNotificationData): string {
  const { orderId, trackingNumber, carrier, estimatedDelivery, trackingUrl } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Order Has Shipped</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #10b981; padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">📦 Your Order Has Shipped!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">
                Great news! Your order is on its way.
              </p>

              <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0;">
                <p style="margin: 0; font-size: 14px; color: #6b7280;">Order Number</p>
                <p style="margin: 4px 0 0; font-size: 18px; font-weight: bold; color: #111827;">#${orderId.toUpperCase()}</p>
              </div>

              <!-- Tracking Info -->
              <h2 style="margin: 24px 0 16px; font-size: 20px; color: #111827;">Tracking Information</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #d1fae5; background-color: #f0fdf4; border-radius: 4px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #065f46;"><strong>Carrier:</strong> ${carrier}</p>
                    <p style="margin: 0 0 8px; color: #065f46;"><strong>Tracking Number:</strong> ${trackingNumber}</p>
                    <p style="margin: 0; color: #065f46;"><strong>Estimated Delivery:</strong> ${estimatedDelivery}</p>
                  </td>
                </tr>
              </table>

              ${trackingUrl ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${trackingUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Track Your Package
                </a>
              </div>
              ` : ''}

              <p style="margin: 24px 0 0; font-size: 14px; color: #6b7280; text-align: center;">
                Questions? Contact us at support@yourcompany.com
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} E-Commerce Store. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Generate plain text email for shipping notification
 */
function generateShippingNotificationText(data: ShippingNotificationData): string {
  const { orderId, trackingNumber, carrier, estimatedDelivery, trackingUrl } = data;

  return `
YOUR ORDER HAS SHIPPED!

Great news! Your order is on its way.

Order Number: #${orderId.toUpperCase()}

TRACKING INFORMATION:
Carrier: ${carrier}
Tracking Number: ${trackingNumber}
Estimated Delivery: ${estimatedDelivery}

${trackingUrl ? `Track your package: ${trackingUrl}` : ''}

Questions? Contact us at support@yourcompany.com

© ${new Date().getFullYear()} E-Commerce Store. All rights reserved.
  `.trim();
}

/**
 * Generate HTML email for abandoned cart reminder
 */
function generateAbandonedCartReminderHTML(data: AbandonedCartReminderData): string {
  const { orderId, items, totalAmount, checkoutUrl, expiresInMinutes } = data;

  const itemsHTML = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${item.productName}</strong><br>
        <span style="color: #6b7280;">Qty: ${item.quantity}</span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        $${(item.pricePerUnit / 100).toFixed(2)}
      </td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Items Waiting in Your Cart</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #f59e0b; padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">🛒 Don't Forget Your Items!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">
                You left some great items in your cart. Complete your order before they're gone!
              </p>

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  ⏰ Your reservation expires in <strong>${expiresInMinutes} minutes</strong>
                </p>
              </div>

              <!-- Cart Items -->
              <h2 style="margin: 24px 0 16px; font-size: 20px; color: #111827;">Items in Your Cart</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 4px;">
                ${itemsHTML}
                <tr>
                  <td style="padding: 16px; font-weight: bold; font-size: 18px;">Total</td>
                  <td style="padding: 16px; text-align: right; font-weight: bold; font-size: 18px; color: #f59e0b;">
                    $${(totalAmount / 100).toFixed(2)}
                  </td>
                </tr>
              </table>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${checkoutUrl}" style="display: inline-block; background-color: #f59e0b; color: #ffffff; padding: 16px 48px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  Complete Your Order
                </a>
              </div>

              <p style="margin: 24px 0 0; font-size: 14px; color: #6b7280; text-align: center;">
                Questions? Contact us at support@yourcompany.com
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} E-Commerce Store. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Generate plain text email for abandoned cart reminder
 */
function generateAbandonedCartReminderText(data: AbandonedCartReminderData): string {
  const { items, totalAmount, checkoutUrl, expiresInMinutes } = data;

  const itemsText = items
    .map(
      (item) =>
        `  ${item.productName} (Qty: ${item.quantity}) - $${(item.pricePerUnit / 100).toFixed(2)}`
    )
    .join('\n');

  return `
DON'T FORGET YOUR ITEMS!

You left some great items in your cart. Complete your order before they're gone!

⏰ Your reservation expires in ${expiresInMinutes} minutes

ITEMS IN YOUR CART:
${itemsText}

Total: $${(totalAmount / 100).toFixed(2)}

Complete your order: ${checkoutUrl}

Questions? Contact us at support@yourcompany.com

© ${new Date().getFullYear()} E-Commerce Store. All rights reserved.
  `.trim();
}
