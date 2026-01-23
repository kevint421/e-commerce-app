import axios from 'axios';
import type { Product, Order, CreateOrderRequest, CreateOrderResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include admin token in Authorization header
apiClient.interceptors.request.use(
  (config) => {
    // Add Authorization header for admin endpoints
    if (config.url?.startsWith('/admin') && config.url !== '/admin/auth') {
      const token = localStorage.getItem('admin_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle unauthorized responses
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // If 401 Unauthorized on admin endpoint, clear session and redirect to login
    if (error.response?.status === 401 && error.config?.url?.startsWith('/admin')) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_username');
      // Redirect to login page
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

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