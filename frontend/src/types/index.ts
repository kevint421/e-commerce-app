export interface Product {
  productId: string;
  name: string;
  description: string;
  price: number; // in cents
  category: string;
  imageUrl?: string;
  active: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  pricePerUnit: number;
  totalPrice: number;
}

export type OrderStatus =
  | 'PENDING'
  | 'INVENTORY_RESERVED'
  | 'PAYMENT_CONFIRMED'
  | 'SHIPPING_ALLOCATED'
  | 'DELIVERED'
  | 'CANCELLED';

export const OrderStatus = {
  PENDING: 'PENDING' as const,
  INVENTORY_RESERVED: 'INVENTORY_RESERVED' as const,
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED' as const,
  SHIPPING_ALLOCATED: 'SHIPPING_ALLOCATED' as const,
  DELIVERED: 'DELIVERED' as const,
  CANCELLED: 'CANCELLED' as const,
};

export interface Order {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  shippingAddress: Address;
  
  // Payment fields
  paymentIntentId?: string;
  paymentStatus?: 'pending' | 'succeeded' | 'failed' | 'refunded';
  paymentMethod?: string;
  paymentFailureReason?: string;
  
  // Shipping fields
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderRequest {
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  shippingAddress: Address;
}

export interface CreateOrderResponse {
  orderId: string;
  clientSecret: string;
  totalAmount: number;
  status: string;
}

export interface PaymentIntentConfirmation {
  orderId: string;
  paymentIntentId: string;
  status: string;
}