import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Package, ArrowRight } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { ordersApi } from '../api/client';
import { formatPrice, formatDateTime } from '../utils/format';

export function OrderConfirmationPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.getById(orderId!),
    enabled: !!orderId,
    refetchInterval: 5000, // Poll every 5 seconds for status updates
  });

  if (!orderId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No order ID provided</p>
          <Link to="/">
            <Button>Return to Shopping</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Order not found</p>
          <Link to="/">
            <Button>Return to Shopping</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Success Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Order Confirmed!
          </h1>
          <p className="text-lg text-gray-600">
            Thank you for your purchase. Your order is being processed.
          </p>
        </div>

        {/* Order Details Card */}
        <div className="card p-8 mb-6">
          <div className="flex items-center justify-between mb-6 pb-6 border-b border-gray-200">
            <div>
              <p className="text-sm text-gray-600">Order Number</p>
              <p className="text-lg font-semibold text-gray-900 font-mono">
                {order.orderId}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Order Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatDateTime(order.createdAt)}
              </p>
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h3>
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.productId} className="flex justify-between">
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
          </div>

          {/* Total */}
          <div className="border-t border-gray-200 pt-4 mb-6">
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{formatPrice(order.totalAmount)}</span>
            </div>
          </div>

          {/* Shipping Address */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Shipping Address
            </h3>
            <p className="text-gray-600">
              {order.shippingAddress.street}<br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />
              {order.shippingAddress.country}
            </p>
          </div>

          {/* Tracking Info (if available) */}
          {order.trackingNumber && (
            <div className="border-t border-gray-200 pt-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Tracking Information
              </h3>
              <div className="flex items-center space-x-4">
                <Package className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Tracking Number</p>
                  <p className="font-mono font-medium text-gray-900">
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
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link to={`/track-order?orderId=${order.orderId}`} className="flex-1">
            <Button className="w-full" variant="primary">
              Track Order
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/" className="flex-1">
            <Button className="w-full" variant="secondary">
              Continue Shopping
            </Button>
          </Link>
        </div>

        {/* Email Msg */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            📧 A confirmation email has been sent to your email address.
          </p>
        </div>
      </div>
    </div>
  );
}