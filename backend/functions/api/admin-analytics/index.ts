import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  OrderRepository,
  InventoryRepository,
  ProductRepository,
  OrderStatus,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

const orderRepo = new OrderRepository();
const inventoryRepo = new InventoryRepository();
const productRepo = new ProductRepository();

/**
 * Admin: Analytics Lambda
 * GET /admin/analytics
 *
 * Returns comprehensive analytics and metrics:
 * - Total orders (all time)
 * - Orders by status
 * - Revenue statistics
 * - Abandoned cart metrics
 * - Low inventory alerts
 * - Recent orders
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  logger.info('Admin: Fetching analytics');

  try {
    // Fetch all orders for analytics (limit to recent 1000 for performance)
    const allOrders = await orderRepo.listAll({ limit: 1000 });
    const orders = allOrders.items;

    // Calculate order statistics
    const totalOrders = orders.length;

    const ordersByStatus = {
      [OrderStatus.PENDING]: 0,
      [OrderStatus.INVENTORY_RESERVED]: 0,
      [OrderStatus.PAYMENT_CONFIRMED]: 0,
      [OrderStatus.SHIPPING_ALLOCATED]: 0,
      [OrderStatus.CANCELLED]: 0,
    };

    let totalRevenue = 0;
    let totalRefunded = 0;
    let completedOrders = 0;
    let abandonedCarts = 0;

    for (const order of orders) {
      // Count by status
      if (order.status in ordersByStatus) {
        ordersByStatus[order.status]++;
      }

      // Calculate revenue (from successfully shipped orders)
      if (order.status === OrderStatus.SHIPPING_ALLOCATED) {
        totalRevenue += order.totalAmount;
        completedOrders++;
      }

      // Count refunds
      if (order.paymentStatus === 'refunded') {
        totalRefunded += order.totalAmount;
      }

      // Count abandoned carts
      if (
        order.status === OrderStatus.CANCELLED &&
        order.metadata?.cancelReason === 'ABANDONED_CART'
      ) {
        abandonedCarts++;
      }
    }

    // Calculate average order value
    const averageOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

    // Calculate abandonment rate
    const totalAttempts = totalOrders;
    const abandonmentRate = totalAttempts > 0 ? (abandonedCarts / totalAttempts) * 100 : 0;

    // Get recent orders (last 10)
    const recentOrders = orders.slice(0, 10);

    // Get inventory statistics
    const products = await productRepo.getAllActive({ limit: 100 });
    const lowInventoryProducts: any[] = [];

    for (const product of products.items) {
      const inventoryList = await inventoryRepo.getByProductId(product.productId);
      const totalStock = inventoryList.items.reduce((sum, inv) => sum + inv.quantity, 0);
      const totalReserved = inventoryList.items.reduce((sum, inv) => sum + inv.reserved, 0);

      if (totalStock - totalReserved < 10) {
        // Low stock threshold: 10 units
        lowInventoryProducts.push({
          productId: product.productId,
          name: product.name,
          totalStock,
          reserved: totalReserved,
          available: totalStock - totalReserved,
        });
      }
    }

    // Build analytics response
    const analytics = {
      summary: {
        totalOrders,
        completedOrders,
        totalRevenue: totalRevenue / 100, // Convert cents to dollars
        totalRefunded: totalRefunded / 100,
        averageOrderValue: averageOrderValue / 100,
      },
      orders: {
        byStatus: Object.entries(ordersByStatus).map(([status, count]) => ({
          status,
          count,
          percentage: totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : '0.0',
        })),
      },
      abandonedCarts: {
        count: abandonedCarts,
        rate: abandonmentRate.toFixed(2) + '%',
      },
      inventory: {
        lowStockCount: lowInventoryProducts.length,
        lowStockProducts: lowInventoryProducts.slice(0, 5), // Top 5
      },
      recentOrders: recentOrders.map((order) => ({
        orderId: order.orderId,
        customerId: order.customerId,
        totalAmount: order.totalAmount / 100,
        status: order.status,
        createdAt: order.createdAt,
      })),
      timestamp: getCurrentTimestamp(),
    };

    logger.info('Analytics generated', {
      totalOrders,
      completedOrders,
      totalRevenue,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(analytics),
    };
  } catch (error: any) {
    logger.error('Failed to generate analytics', error);

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
