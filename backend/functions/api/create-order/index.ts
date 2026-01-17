import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  OrderRepository,
  ProductRepository,
  InventoryRepository,
  createPaymentIntent,
  IdempotencyService,
  OrderStatus,
  Order,
  logger,
  validateRequired,
  validateOrderItems,
  validateAddress,
  generateId,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

// Initialize services (reused across invocations)
const orderRepo = new OrderRepository();
const productRepo = new ProductRepository();
const inventoryRepo = new InventoryRepository();
const idempotency = new IdempotencyService();

/**
 * Create Order Lambda Handler
 * POST /orders
 * 
 * Creates a new order and Stripe Payment Intent, returns clientSecret
 * The order saga is NOT started yet - it will be triggered by the webhook
 * after the frontend confirms the payment.
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  logger.setContext({ requestId });

  logger.info('Create order request received', {
    path: event.path,
    method: event.httpMethod,
  });

  try {
    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'Request body is required');
    }

    const orderData = JSON.parse(event.body);

    // Validate required fields
    try {
      validateRequired(orderData, ['customerId', 'items', 'shippingAddress']);
      validateOrderItems(orderData.items);
      validateAddress(orderData.shippingAddress);
    } catch (validationError: any) {
      return errorResponse(400, validationError.message);
    }

    // Generate order ID
    const orderId = generateId();
    logger.setContext({ orderId, customerId: orderData.customerId });

    logger.info('Creating order', {
      customerId: orderData.customerId,
      itemCount: orderData.items.length,
    });

    // Create order with idempotency
    const result = await idempotency.executeOnce(
      IdempotencyService.generateOrderKey(orderId, 'create'),
      'create-order',
      async () => {
        // 1. Validate all products exist and are active
        const productIds = orderData.items.map((item: any) => item.productId);
        const products = await productRepo.getByIds(productIds);

        if (products.length !== productIds.length) {
          throw new Error('One or more products not found');
        }

        // Check each product is active
        for (const product of products) {
          if (!product.active) {
            throw new Error(`Product ${product.name} is not available`);
          }
        }

        // 2. Build order items with current prices
        let totalAmount = 0;
        const enrichedItems = orderData.items.map((item: any) => {
          const product = products.find((p) => p.productId === item.productId);
          if (!product) {
            throw new Error(`Product ${item.productId} not found`);
          }

          const itemTotal = product.price * item.quantity;
          totalAmount += itemTotal;

          return {
            productId: product.productId,
            productName: product.name,
            quantity: item.quantity,
            pricePerUnit: product.price,
            totalPrice: itemTotal,
          };
        });

        // 3. Check inventory availability (don't reserve yet)
        for (const item of enrichedItems) {
          const hasStock = await inventoryRepo.hasStock(
            item.productId,
            item.quantity
          );
          if (!hasStock) {
            throw new Error(
              `Insufficient inventory for product: ${item.productName}`
            );
          }
        }

        // 4. Create Stripe Payment Intent
        // This generates the clientSecret that frontend will use
        logger.info('Creating Stripe Payment Intent', { totalAmount });
        
        const paymentIntent = await createPaymentIntent(
          totalAmount,
          'usd',
          {
            orderId,
            customerId: orderData.customerId,
          }
        );

        logger.info('Payment Intent created', {
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret?.substring(0, 20) + '...',
        });

        // 5. Create order in database
        const newOrder: Omit<Order, 'createdAt' | 'updatedAt'> = {
          orderId,
          customerId: orderData.customerId,
          items: enrichedItems,
          totalAmount,
          status: OrderStatus.PENDING, // Will transition after payment
          shippingAddress: orderData.shippingAddress,
          paymentIntentId: paymentIntent.id,
          paymentStatus: 'pending',
        };

        const createdOrder = await orderRepo.create(newOrder);

        logger.info('Order created in database', {
          orderId,
          totalAmount,
          status: createdOrder.status,
          paymentIntentId: paymentIntent.id,
        });

        return {
          order: createdOrder,
          clientSecret: paymentIntent.client_secret,
        };
      }
    );

    // saga will be triggered by the Stripe webhook when payment succeeds

    // 7. Return success response with clientSecret
    return successResponse(201, {
      orderId: result.order.orderId,
      clientSecret: result.clientSecret,
      totalAmount: result.order.totalAmount,
      status: result.order.status,
    });
  } catch (error: any) {
    logger.error('Failed to create order', error);

    if (error instanceof SyntaxError) {
      return errorResponse(400, 'Invalid JSON in request body');
    }

    if (error.message.includes('not found') || error.message.includes('not available')) {
      return errorResponse(400, error.message);
    }

    if (error.message.includes('Insufficient inventory')) {
      return errorResponse(400, error.message);
    }

    if (error.message.includes('already completed')) {
      return errorResponse(409, 'Order already exists');
    }

    return errorResponse(500, 'Internal server error');
  }
};

/**
 * Helper: Success response
 */
function successResponse(statusCode: number, data: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    },
    body: JSON.stringify({
      error: message,
      timestamp: getCurrentTimestamp(),
    }),
  };
}