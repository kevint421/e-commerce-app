/**
 * Format price from cents to dollars
 */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Format date to readable string
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format datetime to readable string
 */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get order status display text
 */
export function getOrderStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    PENDING: 'Processing',
    INVENTORY_RESERVED: 'Payment Processing',
    PAYMENT_CONFIRMED: 'Preparing Shipment',
    SHIPPING_ALLOCATED: 'Shipped',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  };
  return statusMap[status] || status;
}

/**
 * Get order status color
 */
export function getOrderStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    INVENTORY_RESERVED: 'bg-blue-100 text-blue-800',
    PAYMENT_CONFIRMED: 'bg-indigo-100 text-indigo-800',
    SHIPPING_ALLOCATED: 'bg-green-100 text-green-800',
    DELIVERED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };
  return colorMap[status] || 'bg-gray-100 text-gray-800';
}