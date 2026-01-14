import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatPrice } from '../../utils/format';
import type { CartItem as CartItemType } from '../../types';

interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export function CartItem({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  const { product, quantity } = item;

  const handleDecrease = () => {
    if (quantity > 1) {
      onUpdateQuantity(product.productId, quantity - 1);
    }
  };

  const handleIncrease = () => {
    onUpdateQuantity(product.productId, quantity + 1);
  };

  const handleRemove = () => {
    onRemove(product.productId);
  };

  return (
    <div className="flex items-center space-x-4 py-4 border-b border-gray-200 last:border-0">
      {/* Product Image */}
      <div className="flex-shrink-0 w-20 h-20 bg-gray-100 rounded-md flex items-center justify-center">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover rounded-md"
          />
        ) : (
          <span className="text-3xl">📦</span>
        )}
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-gray-900 truncate">
          {product.name}
        </h4>
        <p className="text-sm text-gray-600 mt-0.5">
          {formatPrice(product.price)}
        </p>
      </div>

      {/* Quantity Controls */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleDecrease}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors"
          aria-label="Decrease quantity"
        >
          <Minus className="h-4 w-4 text-gray-600" />
        </button>
        
        <span className="text-sm font-medium text-gray-900 w-8 text-center">
          {quantity}
        </span>
        
        <button
          onClick={handleIncrease}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors"
          aria-label="Increase quantity"
        >
          <Plus className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Remove Button */}
      <button
        onClick={handleRemove}
        className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
        aria-label="Remove item"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}