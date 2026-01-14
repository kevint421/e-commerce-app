import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ProductGrid } from '../components/products/ProductGrid';
import { productsApi } from '../api/client';
import { useCartStore } from '../store/cartStore';
import type { Product } from '../types';

export function ProductsPage() {
  const addItem = useCartStore((state) => state.addItem);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: productsApi.getAll,
  });

  const handleAddToCart = (product: Product) => {
    addItem(product, 1);
    toast.success(`Added ${product.name} to cart`, {
      duration: 2000,
      position: 'bottom-right',
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Kevin's Tech Products
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Discover our collection of the latest laptops, smartphones, and accessories.
        </p>
      </div>

      {/* Products Grid */}
      <ProductGrid
        products={products}
        loading={isLoading}
        onAddToCart={handleAddToCart}
      />
    </div>
  );
}