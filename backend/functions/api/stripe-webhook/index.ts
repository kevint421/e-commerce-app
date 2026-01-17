import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  getStripeClient,
  OrderRepository,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const orderRepo = new OrderRepository();
const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'us-east-2' });
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;

// Cache webhook secret to avoid fetching on every invocation
let cachedWebhookSecret: string | null = null;

/**
 * Get Stripe webhook secret from Secrets Manager
 */
async function getWebhookSecret(): Promise<string | null> {
  if (cachedWebhookSecret) {
    return cachedWebhookSecret;
  }

  try {
    const secretsManager = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });

    const response = await secretsManager.send(
      new GetSecretValueCommand({
        SecretId: 'ecommerce/stripe/webhook-secret',
      })
    );

    cachedWebhookSecret = response.SecretString || null;
    
    if (cachedWebhookSecret) {
      logger.info('Webhook secret loaded from Secrets Manager');
    }
    
    return cachedWebhookSecret;
  } catch (error: any) {
    // If secret doesn't exist, log warning but continue (for dev/testing)
    logger.warn('Webhook secret not found in Secrets Manager - signature verification disabled', {
      error: error.message,
    });
    return null;
  }
}

/**
 * Stripe Webhook Handler
 * POST /webhooks/stripe
 * 
 * Handles Stripe webhook events:
 * - payment_intent.succeeded → Start order fulfillment saga
 * - payment_intent.payment_failed → Cancel order
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  logger.setContext({ requestId });

  logger.info('Stripe webhook received', {
    path: event.path,
    headers: event.headers,
  });

  try {
    // Get webhook secret from Secrets Manager
    const webhookSecret = await getWebhookSecret();
    
    // Verify webhook signature
    const stripe = await getStripeClient();
    const signature = event.headers['Stripe-Signature'] || event.headers['stripe-signature'];
    
    if (!event.body) {
      return errorResponse(400, 'Request body is required');
    }

    let stripeEvent: Stripe.Event;

    if (webhookSecret && signature) {
      try {
        // Verify the webhook signature
        stripeEvent = stripe.webhooks.constructEvent(
          event.body,
          signature,
          webhookSecret
        );
        logger.info('Webhook signature verified');
      } catch (err: any) {
        logger.error('Webhook signature verification failed', err);
        return errorResponse(400, `Webhook signature verification failed: ${err.message}`);
      }
    } else {
      // No webhook secret configured - parse event directly (dev mode)
      logger.warn('Webhook signature verification skipped - no secret configured');
      stripeEvent = JSON.parse(event.body) as Stripe.Event;
    }

    logger.info('Processing Stripe event', {
      eventId: stripeEvent.id,
      eventType: stripeEvent.type,
    });

    // Handle different event types
    switch (stripeEvent.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(stripeEvent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(stripeEvent);
        break;

      case 'payment_intent.canceled':
        await handlePaymentCanceled(stripeEvent);
        break;

      default:
        logger.info('Unhandled event type', { eventType: stripeEvent.type });
    }

    return successResponse(200, { received: true });
  } catch (error: any) {
    logger.error('Webhook handler error', error);
    return errorResponse(500, 'Webhook handler error');
  }
};

/**
 * Handle successful payment - start order fulfillment saga
 */
async function handlePaymentSucceeded(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const orderId = paymentIntent.metadata.orderId;

  logger.info('Payment succeeded', {
    paymentIntentId: paymentIntent.id,
    orderId,
    amount: paymentIntent.amount,
  });

  if (!orderId) {
    logger.error('Payment Intent missing orderId in metadata');
    return;
  }

  try {
    // 1. Get the order first to check current status
    const existingOrder = await orderRepo.get(orderId);
    if (!existingOrder) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // 2. Idempotency check - skip if order already processed
    if (existingOrder.status !== 'PENDING') {
      logger.warn('Order already processed - skipping duplicate webhook', {
        orderId,
        currentStatus: existingOrder.status,
        paymentIntentId: paymentIntent.id,
        existingPaymentIntentId: existingOrder.paymentIntentId,
      });
      return; // Don't process again
    }

    // 3. Update order with payment info
    await orderRepo.updatePaymentInfo(orderId, {
      paymentIntentId: paymentIntent.id,
      paymentStatus: 'succeeded',
      paymentMethod: paymentIntent.payment_method?.toString(),
    });

    logger.info('Order payment info updated', { orderId });

    // 4. Get the updated full order data
    const order = await orderRepo.get(orderId);
    if (!order) {
      throw new Error(`Order not found after update: ${orderId}`);
    }

    // 5. Start Step Functions execution (Order Fulfillment Saga)
    const executionName = `order-${orderId}-${Date.now()}`;
    
    const startExecutionCommand = new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: executionName,
      input: JSON.stringify({
        orderId: order.orderId,
        customerId: order.customerId,
        items: order.items,
        totalAmount: order.totalAmount,
        shippingAddress: order.shippingAddress,
        paymentIntentId: paymentIntent.id,
      }),
    });

    const execution = await sfnClient.send(startExecutionCommand);

    logger.info('Order fulfillment saga started', {
      orderId,
      executionArn: execution.executionArn,
      stateMachine: STATE_MACHINE_ARN,
    });
  } catch (error: any) {
    logger.error('Failed to process payment success', error, {
      orderId,
      paymentIntentId: paymentIntent.id,
    });
    throw error;
  }
}

/**
 * Handle failed payment - cancel order
 */
async function handlePaymentFailed(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const orderId = paymentIntent.metadata.orderId;

  logger.info('Payment failed', {
    paymentIntentId: paymentIntent.id,
    orderId,
    lastPaymentError: paymentIntent.last_payment_error,
  });

  if (!orderId) {
    logger.error('Payment Intent missing orderId in metadata');
    return;
  }

  try {
    // Update order status to cancelled
    await orderRepo.updateStatus(orderId, 'CANCELLED');
    await orderRepo.updatePaymentInfo(orderId, {
      paymentIntentId: paymentIntent.id,
      paymentStatus: 'failed',
      paymentMethod: paymentIntent.payment_method?.toString(),
    });

    logger.info('Order cancelled due to payment failure', { orderId });
  } catch (error: any) {
    logger.error('Failed to handle payment failure', error, {
      orderId,
      paymentIntentId: paymentIntent.id,
    });
  }
}

/**
 * Handle canceled payment
 */
async function handlePaymentCanceled(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const orderId = paymentIntent.metadata.orderId;

  logger.info('Payment canceled', {
    paymentIntentId: paymentIntent.id,
    orderId,
  });

  if (!orderId) {
    return;
  }

  try {
    await orderRepo.updateStatus(orderId, 'CANCELLED');
    await orderRepo.updatePaymentInfo(orderId, {
      paymentIntentId: paymentIntent.id,
      paymentStatus: 'canceled',
    });

    logger.info('Order cancelled due to payment cancellation', { orderId });
  } catch (error: any) {
    logger.error('Failed to handle payment cancellation', error, {
      orderId,
      paymentIntentId: paymentIntent.id,
    });
  }
}

/**
 * Helper: Success response
 */
function successResponse(statusCode: number, data: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

/**
 * Helper: Error response
 */
function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error: message,
      timestamp: getCurrentTimestamp(),
    }),
  };
}