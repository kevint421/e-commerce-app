/**
 * Integration Test: Order Fulfillment Flow
 *
 * This test validates the complete order flow from creation to completion.
 * It tests the integration between Lambda functions, DynamoDB, and Step Functions.
 *
 * Prerequisites:
 * - AWS credentials configured
 * - Infrastructure deployed to test environment
 * - Test data seeded in DynamoDB
 */

import axios from 'axios';

// Configuration from environment variables
const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_CUSTOMER_ID = process.env.TEST_CUSTOMER_ID || 'test-customer-integration';

describe('Order Fulfillment Integration Tests', () => {
  let createdOrderId: string;

  describe('Complete Order Flow', () => {
    it('should create an order successfully', async () => {
      const orderData = {
        customerId: TEST_CUSTOMER_ID,
        items: [
          {
            productId: 'prod-laptop-1',
            quantity: 1,
          },
        ],
        shippingAddress: {
          street: '123 Integration Test St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94102',
          country: 'US',
        },
      };

      const response = await axios.post(`${API_URL}/orders`, orderData, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('orderId');
      expect(response.data).toHaveProperty('clientSecret');
      expect(response.data).toHaveProperty('totalAmount');
      expect(response.data.status).toBe('PENDING');

      createdOrderId = response.data.orderId;
    }, 10000); // 10 second timeout

    it('should retrieve the created order', async () => {
      if (!createdOrderId) {
        throw new Error('No order created in previous test');
      }

      const response = await axios.get(`${API_URL}/orders/${createdOrderId}`);

      expect(response.status).toBe(200);
      expect(response.data.order).toHaveProperty('orderId', createdOrderId);
      expect(response.data.order).toHaveProperty('status');
      expect(response.data.order).toHaveProperty('totalAmount');
      expect(response.data.order).toHaveProperty('customerId', TEST_CUSTOMER_ID);
    }, 10000);

    it('should return 404 for non-existent order', async () => {
      try {
        await axios.get(`${API_URL}/orders/non-existent-order-id`);
        fail('Should have thrown 404 error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data).toHaveProperty('error');
      }
    }, 10000);
  });

  describe('Product Catalog', () => {
    it('should list all products', async () => {
      const response = await axios.get(`${API_URL}/products`);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('products');
      expect(Array.isArray(response.data.products)).toBe(true);
      expect(response.data.products.length).toBeGreaterThan(0);

      const product = response.data.products[0];
      expect(product).toHaveProperty('productId');
      expect(product).toHaveProperty('name');
      expect(product).toHaveProperty('price');
      expect(product).toHaveProperty('category');
    }, 10000);
  });

  describe('Inventory Check', () => {
    it('should check inventory availability', async () => {
      const response = await axios.get(`${API_URL}/inventory/prod-laptop-1`);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('productId');
      expect(response.data).toHaveProperty('inStock');
      expect(response.data).toHaveProperty('warehouses');
      expect(Array.isArray(response.data.warehouses)).toBe(true);
      expect(response.data.inStock).toBe(true);
    }, 10000);

    it('should return 404 for non-existent product inventory', async () => {
      try {
        await axios.get(`${API_URL}/inventory/non-existent-product`);
        fail('Should have thrown 404 error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid order data', async () => {
      const invalidOrderData = {
        customerId: TEST_CUSTOMER_ID,
        // Missing required fields: items, shippingAddress
      };

      try {
        await axios.post(`${API_URL}/orders`, invalidOrderData);
        fail('Should have thrown 400 error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toHaveProperty('error');
      }
    }, 10000);

    it('should return 400 for order with non-existent product', async () => {
      const orderData = {
        customerId: TEST_CUSTOMER_ID,
        items: [
          {
            productId: 'non-existent-product-id',
            quantity: 1,
          },
        ],
        shippingAddress: {
          street: '123 Test St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94102',
          country: 'US',
        },
      };

      try {
        await axios.post(`${API_URL}/orders`, orderData);
        fail('Should have thrown 400 error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toHaveProperty('error');
        expect(error.response.data.error).toContain('not found');
      }
    }, 10000);
  });
});
