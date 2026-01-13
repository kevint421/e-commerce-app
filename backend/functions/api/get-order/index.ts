import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  OrderRepository,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

const orderRepo = new OrderRepository();

/**
 * Get Order Lambda Handler
 * GET /orders/{orderId}
 * 
 * Retrieves order details and event history
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  logger.setContext({ requestId });

  try {
    // Get order ID from path parameters
    const orderId = event.pathParameters?.orderId;

    if (!orderId) {
      return errorResponse(400, 'Order ID is required');
    }

    logger.setContext({ orderId });
    logger.info('Get order request received', { orderId });

    // Fetch order from database
    const order = await orderRepo.getById(orderId);

    if (!order) {
      return errorResponse(404, 'Order not found');
    }

    // Optionally fetch event history if requested
    const includeEvents = event.queryStringParameters?.includeEvents === 'true';
    let events = null;

    if (includeEvents) {
      const eventHistory = await eventRepo.getByOrderId(orderId);
      events = eventHistory.items.map((e) => ({
        eventType: e.eventType,
        timestamp: e.timestamp,
        payload: e.payload,
      }));
    }

    logger.info('Order retrieved successfully', {
      orderId,
      status: order.status,
    });

    return successResponse(200, {
      order,
      ...(events && { events }),
    });
  } catch (error: any) {
    logger.error('Failed to get order', error);
    return errorResponse(500, 'Internal server error');
  }
};

function successResponse(statusCode: number, data: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(data),
  };
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      error: message,
      timestamp: getCurrentTimestamp(),
    }),
  };
}