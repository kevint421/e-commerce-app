import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { ordersApi } from '../api/client';
import { formatPrice, formatDateTime, getOrderStatusText, getOrderStatusColor } from '../utils/format';

export function OrderTrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialOrderId = searchParams.get('orderId') || '';
  
  const [orderIdInput, setOrderIdInput] = useState(initialOrderId);
  const [searchOrderId, setSearchOrderId] = useState(initialOrderId);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['order', searchOrderId],
    queryFn: () => ordersApi.getById(searchOrderId),
    enabled: !!searchOrderId,
    refetchInterval: (query) => {
      // Stop polling if order is in final state
      const finalStates = ['SHIPPING_ALLOCATED', 'CANCELLED'];
      const orderData = query.state.data;
      return orderData && finalStates.includes(orderData.status) ? false : 5000;
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderIdInput.trim()) {
      setSearchOrderId(orderIdInput.trim());
      setSearchParams({ orderId: orderIdInput.trim() });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SHIPPING_ALLOCATED':
        return <CheckCircle className="h-8 w-8 text-green-600" />;
      case 'CANCELLED':
        return <XCircle className="h-8 w-8 text-red-600" />;
      default:
        return <Clock className="h-8 w-8 text-blue-600" />;
    }
  };

  const getProgressSteps = (currentStatus: string) => {
    const steps = [
      { status: 'PENDING', label: 'Order Placed' },
      { status: 'INVENTORY_RESERVED', label: 'Payment Processing' },
      { status: 'PAYMENT_CONFIRMED', label: 'Preparing Shipment' },
      { status: 'SHIPPING_ALLOCATED', label: 'Shipped' },
    ];

    const statusOrder = ['PENDING', 'INVENTORY_RESERVED', 'PAYMENT_CONFIRMED', 'SHIPPING_ALLOCATED'];
    const currentIndex = statusOrder.indexOf(currentStatus);

    return steps.map((step, index) => ({
      ...step,
      completed: index <= currentIndex,
      current: index === currentIndex,
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Track Your Order</h1>

        {/* Search Form */}
        <div className="card p-6 mb-8">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="orderId" className="block text-sm font-medium text-gray-700 mb-2">
                Order ID
              </label>
              <input
                type="text"
                id="orderId"
                value={orderIdInput}
                onChange={(e) => setOrderIdInput(e.target.value)}
                placeholder="Enter your order ID"
                className="input"
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" loading={isLoading}>
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>
          </form>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        )}

        {/* Error State */}
        {error && searchOrderId && (
          <div className="card p-8 text-center">
            <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Order Not Found
            </h3>
            <p className="text-gray-600">
              We couldn't find an order with ID: <span className="font-mono">{searchOrderId}</span>
            </p>
          </div>
        )}

        {/* Order Details */}
        {order && !isLoading && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className="card p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  {getStatusIcon(order.status)}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {getOrderStatusText(order.status)}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Order ID: <span className="font-mono">{order.orderId}</span>
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getOrderStatusColor(order.status)}`}>
                  {order.status}
                </span>
              </div>

              {/* Progress Steps */}
              {order.status !== 'CANCELLED' && (
                <div className="relative">
                  <div className="absolute left-0 top-5 h-0.5 bg-gray-200 w-full" />
                  <div className="relative flex justify-between">
                    {getProgressSteps(order.status).map((step, index) => (
                      <div key={step.status} className="flex flex-col items-center">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                            step.completed
                              ? 'bg-green-600 text-white'
                              : step.current
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {step.completed ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            <span className="text-sm font-semibold">{index + 1}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-2 text-center max-w-[100px]">
                          {step.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tracking Information */}
            {order.trackingNumber && (
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Tracking Information
                </h3>
                <div className="flex items-start space-x-4">
                  <Package className="h-6 w-6 text-gray-400 mt-1" />
                  <div>
                    <p className="font-mono text-lg font-semibold text-gray-900">
                      {order.trackingNumber}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Carrier: {order.carrier}
                    </p>
                    {order.estimatedDelivery && (
                      <p className="text-sm text-gray-600">
                        Estimated Delivery: {order.estimatedDelivery}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Order Items */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Order Items
              </h3>
              <div className="space-y-4">
                {order.items.map((item) => (
                  <div key={item.productId} className="flex justify-between py-2">
                    <div>
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                    </div>
                    <p className="font-medium text-gray-900">
                      {formatPrice(item.totalPrice)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 mt-4 pt-4">
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>{formatPrice(order.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Shipping Address
              </h3>
              <p className="text-gray-600">
                {order.shippingAddress.street}<br />
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />
                {order.shippingAddress.country}
              </p>
            </div>

            {/* Order Timeline */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Order Timeline
              </h3>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="mt-1">
                    <div className="h-2 w-2 rounded-full bg-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Order Placed</p>
                    <p className="text-xs text-gray-600">{formatDateTime(order.createdAt)}</p>
                  </div>
                </div>
                {order.updatedAt !== order.createdAt && (
                  <div className="flex items-start space-x-3">
                    <div className="mt-1">
                      <div className="h-2 w-2 rounded-full bg-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Last Updated</p>
                      <p className="text-xs text-gray-600">{formatDateTime(order.updatedAt)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}