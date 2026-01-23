import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  OrderRepository,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

const orderRepo = new OrderRepository();

/**
 * Admin: List All Orders Lambda
 * GET /admin/orders?status=<status>&limit=<limit>&lastKey=<lastKey>
 *
 * Query parameters:
 * - status: Filter by order status (optional)
 * - limit: Number of orders to return (default: 50, max: 100)
 * - lastKey: Pagination token from previous response
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  logger.info('Admin: Listing all orders', {
    queryParams: event.queryStringParameters,
  });

  try {
    const queryParams = event.queryStringParameters || {};
    const status = queryParams.status;
    const limit = Math.min(parseInt(queryParams.limit || '50', 10), 100);
    const lastKey = queryParams.lastKey ? JSON.parse(decodeURIComponent(queryParams.lastKey)) : undefined;

    // Get orders (filtered by status if provided)
    let result;
    if (status) {
      result = await orderRepo.getByStatus(status, { limit, lastEvaluatedKey: lastKey });
    } else {
      result = await orderRepo.listAll({ limit, lastEvaluatedKey: lastKey });
    }

    // Prepare pagination token
    const nextKey = result.lastEvaluatedKey
      ? encodeURIComponent(JSON.stringify(result.lastEvaluatedKey))
      : null;

    logger.info('Orders retrieved', {
      count: result.items.length,
      hasMore: result.hasMore,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        orders: result.items,
        hasMore: result.hasMore,
        nextKey,
        count: result.items.length,
        timestamp: getCurrentTimestamp(),
      }),
    };
  } catch (error: any) {
    logger.error('Failed to list orders', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: getCurrentTimestamp(),
      }),
    };
  }
};
