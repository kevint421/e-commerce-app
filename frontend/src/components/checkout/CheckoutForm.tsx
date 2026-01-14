import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import toast from 'react-hot-toast';
import { Button } from '../common/Button';
import { ordersApi } from '../../api/client';
import { useCartStore } from '../../store/cartStore';
import type { Address } from '../../types';

interface CheckoutFormProps {
  clientSecret?: string;
  orderId?: string;
  totalAmount: number;
  onOrderCreated?: (clientSecret: string, orderId: string) => void;
}

export function CheckoutForm({
  clientSecret,
  orderId,
  totalAmount,
  onOrderCreated,
}: CheckoutFormProps) {
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();
  const { items, clearCart } = useCartStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<Address>({
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });

  const handleAddressChange = (field: keyof Address, value: string) => {
    setShippingAddress((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitAddress = async (e: FormEvent) => {
    e.preventDefault();
    
    if (isProcessing) return;

    // Validate address
    if (!shippingAddress.street || !shippingAddress.city || 
        !shippingAddress.state || !shippingAddress.postalCode) {
      toast.error('Please fill in all address fields');
      return;
    }

    setIsProcessing(true);

    try {
      // Create order (without payment confirmation)
      const response = await ordersApi.create({
        customerId: `customer-${Date.now()}`, // In production, this would be from auth
        items: items.map((item) => ({
          productId: item.product.productId,
          quantity: item.quantity,
        })),
        shippingAddress,
      });

      toast.success('Order created! Please complete payment.');
      
      // Pass clientSecret and orderId back to parent
      if (onOrderCreated) {
        onOrderCreated(response.clientSecret, response.orderId);
      }
    } catch (error: any) {
      console.error('Order creation error:', error);
      toast.error(error.response?.data?.message || 'Failed to create order. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitPayment = async (e: FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    if (isProcessing) return;

    setIsProcessing(true);

    try {
      // Confirm payment with Stripe
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order-confirmation`,
        },
        redirect: 'if_required',
      });

      if (error) {
        console.error('Payment error:', error);
        toast.error(error.message || 'Payment failed. Please try again.');
        setIsProcessing(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === 'succeeded') {
        toast.success('Payment successful!');
        
        // Clear cart
        clearCart();
        
        // Navigate to confirmation page
        navigate(`/order-confirmation?orderId=${orderId}`);
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error('Payment failed. Please try again.');
      setIsProcessing(false);
    }
  };

  // Show shipping form if no clientSecret yet
  if (!clientSecret) {
    return (
      <form onSubmit={handleSubmitAddress} className="space-y-6">
        <div className="card p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Shipping Address
          </h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="street" className="block text-sm font-medium text-gray-700 mb-1">
                Street Address
              </label>
              <input
                type="text"
                id="street"
                value={shippingAddress.street}
                onChange={(e) => handleAddressChange('street', e.target.value)}
                className="input"
                placeholder="123 Main Street"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  id="city"
                  value={shippingAddress.city}
                  onChange={(e) => handleAddressChange('city', e.target.value)}
                  className="input"
                  placeholder="Seattle"
                  required
                />
              </div>

              <div>
                <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <input
                  type="text"
                  id="state"
                  value={shippingAddress.state}
                  onChange={(e) => handleAddressChange('state', e.target.value)}
                  className="input"
                  placeholder="WA"
                  maxLength={2}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700 mb-1">
                  ZIP Code
                </label>
                <input
                  type="text"
                  id="postalCode"
                  value={shippingAddress.postalCode}
                  onChange={(e) => handleAddressChange('postalCode', e.target.value)}
                  className="input"
                  placeholder="98101"
                  required
                />
              </div>

              <div>
                <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
                  Country
                </label>
                <select
                  id="country"
                  value={shippingAddress.country}
                  onChange={(e) => handleAddressChange('country', e.target.value)}
                  className="input"
                  required
                >
                  <option value="US">United States</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={isProcessing}
        >
          Continue to Payment
        </Button>
      </form>
    );
  }

  // Show payment form if we have clientSecret
  return (
    <form onSubmit={handleSubmitPayment} className="space-y-6">
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          Payment Information
        </h2>

        <div className="mb-6">
          <PaymentElement />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
          <p className="text-sm text-blue-800">
            💳 <strong>Test Mode:</strong> Use card <code className="bg-blue-100 px-1 rounded">4242 4242 4242 4242</code>
            {' '}with any future date and CVC.
          </p>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        loading={isProcessing}
        disabled={!stripe || !elements}
      >
        {isProcessing ? 'Processing...' : `Pay ${totalAmount ? `$${(totalAmount / 100).toFixed(2)}` : ''}`}
      </Button>
    </form>
  );
}