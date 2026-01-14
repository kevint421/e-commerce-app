import axios from 'axios';
import type { Product, Order, CreateOrderRequest, CreateOrderResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Products API
export const productsApi = {
  getAll: async (): Promise<Product[]> => {
    const response = await apiClient.get<{ products: Product[] }>('/products');
    return response.data.products;
  },
};

// Orders API
export const ordersApi = {
  create: async (data: CreateOrderRequest): Promise<CreateOrderResponse> => {
    const response = await apiClient.post<CreateOrderResponse>('/orders', data);
    return response.data;
  },

  getById: async (orderId: string): Promise<Order> => {
    const response = await apiClient.get<{ order: Order }>(`/orders/${orderId}`);
    return response.data.order;
  },
};

// Inventory API
export const inventoryApi = {
  check: async (productId: string, quantity: number): Promise<boolean> => {
    const response = await apiClient.get<{ available: boolean }>(
      `/inventory/${productId}?quantity=${quantity}`
    );
    return response.data.available;
  },
};