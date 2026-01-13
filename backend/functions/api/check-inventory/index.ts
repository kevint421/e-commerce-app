import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  InventoryRepository,
  ProductRepository,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

const inventoryRepo = new InventoryRepository();
const productRepo = new ProductRepository();

/**
 * Check Inventory Lambda Handler
 * GET /inventory/{productId}
 * 
 * Returns inventory availability across all warehouses
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  logger.setContext({ requestId });

  try {
    const productId = event.pathParameters?.productId;

    if (!productId) {
      return errorResponse(400, 'Product ID is required');
    }

    logger.setContext({ productId });
    logger.info('Check inventory request received', { productId });

    // Verify product exists
    const product = await productRepo.getById(productId);
    if (!product) {
      return errorResponse(404, 'Product not found');
    }

    // Get inventory across all warehouses
    const inventoryResult = await inventoryRepo.getByProductId(productId);
    const totalAvailable = await inventoryRepo.getTotalAvailableQuantity(productId);

    // Calculate total reserved
    const totalReserved = inventoryResult.items.reduce(
      (sum, inv) => sum + inv.reserved,
      0
    );

    logger.info('Inventory retrieved successfully', {
      productId,
      totalAvailable,
      totalReserved,
      warehouseCount: inventoryResult.items.length,
    });

    return successResponse(200, {
      productId,
      productName: product.name,
      totalAvailable,
      totalReserved,
      warehouses: inventoryResult.items.map((inv) => ({
        warehouseId: inv.warehouseId,
        available: inv.quantity,
        reserved: inv.reserved,
      })),
      inStock: totalAvailable > 0,
    });
  } catch (error: any) {
    logger.error('Failed to check inventory', error);
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
