import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import {
  OrderRepository,
  ProductRepository,
  InventoryRepository,
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

// Initialize Step Functions client
const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'us-east-2' });
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

/**
 * Create Order Lambda Handler
 * POST /orders
 * 
 * Creates order and triggers Step Functions saga
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
    const order = await idempotency.executeOnce(
      IdempotencyService.generateOrderKey(orderId, 'create'),
      'create-order',
      async () => {
        // 1. Validate all products exist and are active
        const productIds = orderData.items.map((item: any) => item.productId);
        const products = await productRepo.getByIds(productIds);

        if (products.length !== productIds.length) {
          const foundIds = products.map((p) => p.productId);
          const missingIds = productIds.filter((id) => !foundIds.includes(id));
          throw new Error(`Products not found: ${missingIds.join(', ')}`);
        }

        const inactiveProducts = products.filter((p) => !p.active);
        if (inactiveProducts.length > 0) {
          throw new Error(
            `Products not available: ${inactiveProducts.map((p) => p.name).join(', ')}`
          );
        }

        // 2. Check inventory availability (fast check before creating order)
        for (const item of orderData.items) {
          const inventoryList = await inventoryRepo.getByProductId(item.productId);
          const totalAvailable = inventoryList.items.reduce(
            (sum, inv) => sum + (inv.quantity - inv.reserved),
            0
          );

          if (totalAvailable < item.quantity) {
            const product = products.find((p) => p.productId === item.productId);
            throw new Error(
              `Insufficient inventory for ${product?.name}. Available: ${totalAvailable}, Requested: ${item.quantity}`
            );
          }
        }

        // 3. Enrich items with product details and calculate totals
        const enrichedItems = orderData.items.map((item: any) => {
          const product = products.find((p) => p.productId === item.productId)!;
          return {
            productId: product.productId,
            productName: product.name,
            quantity: item.quantity,
            pricePerUnit: product.price,
            totalPrice: product.price * item.quantity,
          };
        });

        const totalAmount = enrichedItems.reduce((sum, item) => sum + item.totalPrice, 0);

        // 4. Create order in database (status: PENDING)
        const newOrder: Order = {
          orderId,
          customerId: orderData.customerId,
          items: enrichedItems,
          totalAmount,
          status: OrderStatus.PENDING,
          shippingAddress: orderData.shippingAddress,
          createdAt: getCurrentTimestamp(),
          updatedAt: getCurrentTimestamp(),
        };

        await orderRepo.create(newOrder);

        logger.info('Order created in database', {
          orderId,
          totalAmount,
          status: newOrder.status,
        });

        return newOrder;
      }
    );

    // Trigger Step Functions state machine
    // (Replaces EventBridge publishing)
    if (!STATE_MACHINE_ARN) {
      throw new Error('STATE_MACHINE_ARN environment variable not set');
    }

    try {
      const executionName = `order-${orderId}`;
      
      await sfnClient.send(
        new StartExecutionCommand({
          stateMachineArn: STATE_MACHINE_ARN,
          name: executionName,
          input: JSON.stringify({
            orderId: order.orderId,
          }),
        })
      );

      logger.info('Step Functions execution started', {
        orderId: order.orderId,
        executionName,
        stateMachineArn: STATE_MACHINE_ARN,
      });
    } catch (sfnError: any) {
      logger.error('Failed to start Step Functions execution', sfnError, {
        orderId: order.orderId,
      });
      
      // Order is created but workflow didn't start - this is a critical error
      // In production, might want to:
      // 1. Update order status to ERROR
      // 2. Send alert to operations team
      // 3. Retry logic or manual intervention
      
      throw new Error(`Order created but workflow failed to start: ${sfnError.message}`);
    }

    // 7. Return success response
    return successResponse(201, {
      message: 'Order created successfully',
      order: {
        orderId: order.orderId,
        status: order.status,
        totalAmount: order.totalAmount,
        items: order.items,
        createdAt: order.createdAt,
      },
    });
  } catch (error: any) {
    logger.error('Failed to create order', error);

    if (error instanceof SyntaxError) {
      return errorResponse(400, 'Invalid JSON in request body');
    }

    if (error.message.includes('not found') || error.message.includes('not available')) {
      return errorResponse(404, error.message);
    }

    if (error.message.includes('Insufficient inventory')) {
      return errorResponse(409, error.message);
    }

    return errorResponse(500, 'Internal server error');
  }
};

/**
 * Helper: Success response
 */
function successResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
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
    },
    body: JSON.stringify({
      error: message,
      timestamp: new Date().toISOString(),
    }),
  };
}