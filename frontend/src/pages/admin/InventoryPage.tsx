import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { apiClient } from '../../api/client';
import toast from 'react-hot-toast';

interface Product {
  productId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
}

interface InventoryItem {
  productId: string;
  warehouseId: string;
  quantity: number;
  reserved: number;
  available: number;
}

interface UpdateInventoryForm {
  warehouseId: string;
  quantity: number;
  operation: 'set' | 'add' | 'subtract';
}

export function InventoryPage() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [updateForm, setUpdateForm] = useState<UpdateInventoryForm>({
    warehouseId: 'warehouse-east',
    quantity: 0,
    operation: 'add',
  });
  const queryClient = useQueryClient();

  // Fetch products
  const { data: products, isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await apiClient.get('/products');
      return response.data.products;
    },
  });

  // Fetch inventory for selected product
  const { data: inventory, isLoading: isLoadingInventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', selectedProduct?.productId],
    queryFn: async () => {
      if (!selectedProduct) return [];
      const response = await apiClient.get(`/inventory/${selectedProduct.productId}`);
      const warehouses = response.data.warehouses || [];
      // Transform warehouses array to InventoryItem format
      return warehouses.map((w: any) => ({
        productId: selectedProduct.productId,
        warehouseId: w.warehouseId,
        quantity: w.available + w.reserved,
        reserved: w.reserved,
        available: w.available,
      }));
    },
    enabled: !!selectedProduct,
  });

  // Update inventory mutation
  const updateInventoryMutation = useMutation({
    mutationFn: async ({ productId, data }: { productId: string; data: UpdateInventoryForm }) => {
      const response = await apiClient.put(`/admin/inventory/${productId}`, data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Inventory updated successfully');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setUpdateForm({ warehouseId: 'warehouse-east', quantity: 0, operation: 'add' });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update inventory');
    },
  });

  const handleUpdateInventory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    if (updateForm.quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    updateInventoryMutation.mutate({
      productId: selectedProduct.productId,
      data: updateForm,
    });
  };

  if (isLoadingProducts) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Products List */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">Products</h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {products?.map((product) => (
                <button
                  key={product.productId}
                  onClick={() => setSelectedProduct(product)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors
                    ${selectedProduct?.productId === product.productId ? 'bg-blue-50 border-l-4 border-blue-600' : ''}
                  `}
                >
                  <p className="text-sm font-medium text-gray-900">{product.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{product.productId}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Inventory Details & Update Form */}
          <div className="lg:col-span-2 space-y-6">
            {selectedProduct ? (
              <>
                {/* Product Info */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-start space-x-4">
                    <img
                      src={selectedProduct.imageUrl}
                      alt={selectedProduct.name}
                      className="w-24 h-24 object-cover rounded"
                    />
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-gray-900">{selectedProduct.name}</h2>
                      <p className="text-sm text-gray-500 mt-1">{selectedProduct.description}</p>
                      <p className="text-lg font-medium text-gray-900 mt-2">
                        ${(selectedProduct.price / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Current Inventory */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Current Inventory</h3>
                  </div>
                  {isLoadingInventory ? (
                    <div className="flex justify-center items-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : inventory && inventory.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Warehouse
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Total Stock
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Reserved
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Available
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {inventory.map((item) => (
                            <tr key={item.warehouseId}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {item.warehouseId}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {item.quantity}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {item.reserved}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`font-medium ${item.available < 10 ? 'text-red-600' : 'text-green-600'}`}>
                                  {item.available}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-center text-gray-500">
                      No inventory found for this product
                    </div>
                  )}
                </div>

                {/* Update Inventory Form */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Update Inventory</h3>
                  <form onSubmit={handleUpdateInventory} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Warehouse
                      </label>
                      <select
                        value={updateForm.warehouseId}
                        onChange={(e) => setUpdateForm({ ...updateForm, warehouseId: e.target.value })}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="warehouse-east">Warehouse East</option>
                        <option value="warehouse-west">Warehouse West</option>
                        <option value="warehouse-central">Warehouse Central</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Operation
                      </label>
                      <select
                        value={updateForm.operation}
                        onChange={(e) => setUpdateForm({ ...updateForm, operation: e.target.value as any })}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="add">Add to Stock (Restock)</option>
                        <option value="subtract">Subtract from Stock</option>
                        <option value="set">Set Stock to Exact Value</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={updateForm.quantity}
                        onChange={(e) => setUpdateForm({ ...updateForm, quantity: parseInt(e.target.value) || 0 })}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        placeholder="Enter quantity"
                      />
                    </div>

                    <div className="pt-4">
                      <button
                        type="submit"
                        disabled={updateInventoryMutation.isPending}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updateInventoryMutation.isPending ? 'Updating...' : 'Update Inventory'}
                      </button>
                    </div>
                  </form>

                  <div className="mt-4 p-4 bg-blue-50 rounded-md">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong>
                      {updateForm.operation === 'add' && ' This will add the specified quantity to the current stock.'}
                      {updateForm.operation === 'subtract' && ' This will subtract the specified quantity from the current stock (minimum 0).'}
                      {updateForm.operation === 'set' && ' This will set the stock to the exact quantity specified.'}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <p className="text-gray-500">Select a product to view and manage inventory</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
