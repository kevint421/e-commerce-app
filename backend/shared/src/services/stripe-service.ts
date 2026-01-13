import Stripe from 'stripe';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../utils/logger';

/**
 * Stripe Service
 * Manages Stripe client initialization and common operations
 */

// Cache the Stripe client to avoid re-fetching secret on every invocation
let stripeClient: Stripe | null = null;

/**
 * Get or create Stripe client
 * Retrieves API key from AWS Secrets Manager on first call, then caches
 */
export async function getStripeClient(): Promise<Stripe> {
  if (stripeClient) {
    return stripeClient;
  }

  try {
    // Get secret from Secrets Manager
    const secretsManager = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });

    const response = await secretsManager.send(
      new GetSecretValueCommand({
        SecretId: 'ecommerce/stripe/secret-key',
      })
    );

    const secretKey = response.SecretString;
    if (!secretKey) {
      throw new Error('Stripe secret key not found in Secrets Manager');
    }

    // Initialize Stripe client
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2023-10-16', // Stripe API version
      typescript: true,
    });

    logger.info('Stripe client initialized successfully');
    return stripeClient;
  } catch (error: any) {
    logger.error('Failed to initialize Stripe client', error);
    throw new Error(`Stripe initialization failed: ${error.message}`);
  }
}

/**
 * Create a payment intent
 */
export async function createPaymentIntent(
  amount: number,
  currency: string,
  metadata: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  const stripe = await getStripeClient();

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
      // For backend-only (no frontend), we can use automatic payment methods
      // This creates the intent in a state ready to be confirmed
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never', // No redirects in backend flow
      },
    });

    logger.info('Payment Intent created', {
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
    });

    return paymentIntent;
  } catch (error: any) {
    logger.error('Failed to create Payment Intent', error, { amount, currency, metadata });
    throw error;
  }
}

/**
 * Confirm a payment intent
 * For test mode, this simulates immediate payment confirmation
 */
export async function confirmPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = await getStripeClient();

  try {
    // In test mode, we can confirm without a payment method
    // Stripe will use a default test payment method
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: 'pm_card_visa', // Default test payment method
    });

    logger.info('Payment Intent confirmed', {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    });

    return paymentIntent;
  } catch (error: any) {
    logger.error('Failed to confirm Payment Intent', error, { paymentIntentId });
    throw error;
  }
}

/**
 * Create and confirm payment in one step (synchronous flow)
 */
export async function createAndConfirmPayment(
  amount: number,
  currency: string,
  metadata: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  const stripe = await getStripeClient();

  try {
    // Create and confirm in one API call
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
      confirm: true, // Confirm immediately
      payment_method: 'pm_card_visa', // Test payment method
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });

    logger.info('Payment Intent created and confirmed', {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount,
    });

    return paymentIntent;
  } catch (error: any) {
    logger.error('Failed to create and confirm payment', error, { amount, currency, metadata });
    throw error;
  }
}

/**
 * Create a refund for a payment intent
 */
export async function createRefund(
  paymentIntentId: string,
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<Stripe.Refund> {
  const stripe = await getStripeClient();

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: reason || 'requested_by_customer',
    });

    logger.info('Refund created', {
      refundId: refund.id,
      paymentIntentId,
      amount: refund.amount,
      status: refund.status,
    });

    return refund;
  } catch (error: any) {
    logger.error('Failed to create refund', error, { paymentIntentId });
    throw error;
  }
}

/**
 * Retrieve a payment intent
 */
export async function getPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = await getStripeClient();

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error: any) {
    logger.error('Failed to retrieve Payment Intent', error, { paymentIntentId });
    throw error;
  }
}