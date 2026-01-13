import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  ProductRepository,
  ProductCategory,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

const productRepo = new ProductRepository();

/**
 * List Products Lambda Handler
 * GET /products
 * 
 * Query parameters:
 * - category: Filter by category
 * - search: Search by name
 * - limit: Max results (default 20)
 * - lastKey: Pagination token
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  logger.setContext({ requestId });

  try {
    const queryParams = event.queryStringParameters || {};
    const category = queryParams.category as ProductCategory | undefined;
    const search = queryParams.search;
    const limit = parseInt(queryParams.limit || '20', 10);
    const lastKey = queryParams.lastKey
      ? JSON.parse(decodeURIComponent(queryParams.lastKey))
      : undefined;

    logger.info('List products request received', {
      category,
      search,
      limit,
    });

    let result;

    // Search by name if provided
    if (search) {
      result = await productRepo.searchByName(search, { limit, lastEvaluatedKey: lastKey });
    }
    // Filter by category if provided
    else if (category && Object.values(ProductCategory).includes(category)) {
      result = await productRepo.getByCategory(category, { limit, lastEvaluatedKey: lastKey });
    }
    // Otherwise, get all active products
    else {
      result = await productRepo.getAllActive({ limit, lastEvaluatedKey: lastKey });
    }

    logger.info('Products retrieved successfully', {
      count: result.items.length,
      hasMore: result.hasMore,
    });

    return successResponse(200, {
      products: result.items,
      hasMore: result.hasMore,
      ...(result.lastEvaluatedKey && {
        nextToken: encodeURIComponent(JSON.stringify(result.lastEvaluatedKey)),
      }),
    });
  } catch (error: any) {
    logger.error('Failed to list products', error);
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
