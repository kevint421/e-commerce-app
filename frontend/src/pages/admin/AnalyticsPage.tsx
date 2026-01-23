import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { apiClient } from '../../api/client';
import toast from 'react-hot-toast';

interface AnalyticsData {
  summary: {
    totalOrders: number;
    completedOrders: number;
    totalRevenue: number;
    totalRefunded: number;
    averageOrderValue: number;
  };
  orders: {
    byStatus: Array<{
      status: string;
      count: number;
      percentage: string;
    }>;
  };
  abandonedCarts: {
    count: number;
    rate: string;
  };
  inventory: {
    lowStockCount: number;
    lowStockProducts: Array<{
      productId: string;
      name: string;
      totalStock: number;
      reserved: number;
      available: number;
    }>;
  };
  recentOrders: Array<{
    orderId: string;
    customerId: string;
    totalAmount: number;
    status: string;
    createdAt: string;
  }>;
  timestamp: string;
}

export function AnalyticsPage() {
  const { data: analytics, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/admin/analytics');
        return response.data;
      } catch (err) {
        toast.error('Failed to load analytics');
        throw err;
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !analytics) {
    return (
      <AdminLayout>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load analytics data</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500">
            Last updated: {new Date(analytics.timestamp).toLocaleString()}
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-100 rounded-md p-3">
                <span className="text-2xl">📊</span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Orders</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {analytics.summary.totalOrders}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
                <span className="text-2xl">✅</span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {analytics.summary.completedOrders}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-purple-100 rounded-md p-3">
                <span className="text-2xl">💰</span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Revenue</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    ${analytics.summary.totalRevenue.toFixed(2)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-yellow-100 rounded-md p-3">
                <span className="text-2xl">📈</span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Avg Order Value</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    ${analytics.summary.averageOrderValue.toFixed(2)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Orders by Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Orders by Status</h2>
          <div className="space-y-3">
            {analytics.orders.byStatus.map((statusData) => (
              <div key={statusData.status}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{statusData.status}</span>
                  <span className="text-gray-600">
                    {statusData.count} ({statusData.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${statusData.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Abandoned Carts & Low Inventory */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Abandoned Carts */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Abandoned Carts</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-900">{analytics.abandonedCarts.count}</p>
                <p className="text-sm text-gray-500 mt-1">Total abandoned</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-orange-600">{analytics.abandonedCarts.rate}</p>
                <p className="text-sm text-gray-500 mt-1">Abandonment rate</p>
              </div>
            </div>
          </div>

          {/* Low Inventory Alert */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Low Inventory Alerts</h2>
            <div className="flex items-center mb-4">
              <span className="text-3xl font-bold text-red-600">{analytics.inventory.lowStockCount}</span>
              <span className="ml-2 text-gray-600">products low in stock</span>
            </div>
            {analytics.inventory.lowStockProducts.length > 0 && (
              <div className="space-y-2">
                {analytics.inventory.lowStockProducts.map((product) => (
                  <div key={product.productId} className="flex justify-between text-sm">
                    <span className="text-gray-700">{product.name}</span>
                    <span className="text-red-600 font-medium">{product.available} available</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.recentOrders.map((order) => (
                  <tr key={order.orderId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{order.orderId.toUpperCase()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.customerId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${order.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                        ${order.status === 'SHIPPING_ALLOCATED' ? 'bg-green-100 text-green-800' : ''}
                        ${order.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : ''}
                        ${order.status === 'PENDING' || order.status === 'INVENTORY_RESERVED' ? 'bg-yellow-100 text-yellow-800' : ''}
                        ${order.status === 'PAYMENT_CONFIRMED' ? 'bg-blue-100 text-blue-800' : ''}
                      `}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
