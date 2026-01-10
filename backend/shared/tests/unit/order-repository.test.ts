jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('../../src/utils/dynamodb-client', () => ({
  dynamoClient: {
    send: jest.fn(),
  },
  handleDynamoDBError: jest.fn((error) => { throw error; }),
  withRetry: jest.fn((fn) => fn()),
  getCurrentTimestamp: jest.fn(() => '2024-01-01T00:00:00.000Z'),
  getTableName: jest.fn((name) => 'test-table'),
  buildUpdateExpression: jest.fn((updates) => ({
    UpdateExpression: 'SET mock = :mock',
    ExpressionAttributeNames: {},
    ExpressionAttributeValues: {},
  })),
  buildPaginatedResponse: jest.fn((items, lastKey) => ({
    items,
    lastEvaluatedKey: lastKey,
    hasMore: !!lastKey,
  })),
}));

import { OrderRepository } from '../../src/repositories/order-repository';
import { Order, OrderStatus, OrderItem } from '../../src/types';
import { dynamoClient } from '../../src/utils/dynamodb-client';

describe('OrderRepository', () => {
  let repository: OrderRepository;
  const mockTableName = 'test-orders-table';

  beforeAll(() => {
    process.env.ORDERS_TABLE_NAME = mockTableName;
  });

  beforeEach(() => {
    repository = new OrderRepository();
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new order successfully', async () => {
      const mockOrder: Omit<Order, 'createdAt' | 'updatedAt'> = {
        orderId: 'order-123',
        customerId: 'customer-456',
        items: [
          {
            productId: 'product-789',
            productName: 'Test Product',
            quantity: 2,
            pricePerUnit: 1999,
            totalPrice: 3998,
          },
        ],
        totalAmount: 3998,
        status: OrderStatus.PENDING,
        shippingAddress: {
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94102',
          country: 'US',
        },
      };

      (dynamoClient.send as jest.Mock).mockResolvedValue({});

      const result = await repository.create(mockOrder);

      expect(result).toMatchObject(mockOrder);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(dynamoClient.send).toHaveBeenCalledTimes(1);
    });

    it('should throw error if order already exists', async () => {
      const mockOrder: Omit<Order, 'createdAt' | 'updatedAt'> = {
        orderId: 'order-123',
        customerId: 'customer-456',
        items: [],
        totalAmount: 0,
        status: OrderStatus.PENDING,
        shippingAddress: {
          street: '123 Main St',
          city: 'Test City',
          state: 'TS',
          postalCode: '12345',
          country: 'US',
        },
      };

      const error = new Error('ConditionalCheckFailed');
      error.name = 'ConditionalCheckFailedException';
      (dynamoClient.send as jest.Mock).mockRejectedValue(error);

      await expect(repository.create(mockOrder)).rejects.toThrow();
    });
  });

  describe('getById', () => {
    it('should return order when found', async () => {
      const mockOrderData = {
        PK: 'order-123',
        orderId: 'order-123',
        customerId: 'customer-456',
        items: [],
        totalAmount: 1000,
        status: OrderStatus.PENDING,
        shippingAddress: {
          street: '123 Main St',
          city: 'Test City',
          state: 'TS',
          postalCode: '12345',
          country: 'US',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      (dynamoClient.send as jest.Mock).mockResolvedValue({
        Item: mockOrderData,
      });

      const result = await repository.getById('order-123');

      expect(result).toBeDefined();
      expect(result?.orderId).toBe('order-123');
      expect(result?.customerId).toBe('customer-456');
    });

    it('should return null when order not found', async () => {
      (dynamoClient.send as jest.Mock).mockResolvedValue({});

      const result = await repository.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update order status successfully', async () => {
      const updatedOrder = {
        PK: 'order-123',
        orderId: 'order-123',
        customerId: 'customer-456',
        items: [],
        totalAmount: 1000,
        status: OrderStatus.SHIPPED,
        shippingAddress: {
          street: '123 Main St',
          city: 'Test City',
          state: 'TS',
          postalCode: '12345',
          country: 'US',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      (dynamoClient.send as jest.Mock).mockResolvedValue({
        Attributes: updatedOrder,
      });

      const result = await repository.updateStatus('order-123', OrderStatus.SHIPPED);

      expect(result.status).toBe(OrderStatus.SHIPPED);
      expect(dynamoClient.send).toHaveBeenCalledTimes(1);
    });

    it('should throw error when order does not exist', async () => {
      const error = new Error('ConditionalCheckFailed');
      error.name = 'ConditionalCheckFailedException';
      (dynamoClient.send as jest.Mock).mockRejectedValue(error);

      await expect(
        repository.updateStatus('non-existent', OrderStatus.SHIPPED)
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update order fields successfully', async () => {
      const updatedOrder = {
        PK: 'order-123',
        orderId: 'order-123',
        customerId: 'customer-456',
        items: [],
        totalAmount: 1000,
        status: OrderStatus.SHIPPED,
        trackingNumber: 'TRACK-123',
        shippingAddress: {
          street: '123 Main St',
          city: 'Test City',
          state: 'TS',
          postalCode: '12345',
          country: 'US',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      (dynamoClient.send as jest.Mock).mockResolvedValue({
        Attributes: updatedOrder,
      });

      const result = await repository.update('order-123', {
        trackingNumber: 'TRACK-123',
        status: OrderStatus.SHIPPED,
      });

      expect(result.trackingNumber).toBe('TRACK-123');
      expect(result.status).toBe(OrderStatus.SHIPPED);
    });
  });

  describe('getByCustomerId', () => {
    it('should return paginated orders for customer', async () => {
      const mockOrders = [
        {
          PK: 'order-1',
          orderId: 'order-1',
          customerId: 'customer-456',
          items: [],
          totalAmount: 1000,
          status: OrderStatus.DELIVERED,
          shippingAddress: {} as any,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          PK: 'order-2',
          orderId: 'order-2',
          customerId: 'customer-456',
          items: [],
          totalAmount: 2000,
          status: OrderStatus.SHIPPED,
          shippingAddress: {} as any,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      (dynamoClient.send as jest.Mock).mockResolvedValue({
        Items: mockOrders,
        LastEvaluatedKey: undefined,
      });

      const result = await repository.getByCustomerId('customer-456');

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.items[0].orderId).toBe('order-1');
    });

    it('should handle pagination correctly', async () => {
      const mockOrders = [
        {
          PK: 'order-1',
          orderId: 'order-1',
          customerId: 'customer-456',
          items: [],
          totalAmount: 1000,
          status: OrderStatus.DELIVERED,
          shippingAddress: {} as any,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const lastKey = { PK: 'order-1', SK: '2024-01-01T00:00:00Z' };

      (dynamoClient.send as jest.Mock).mockResolvedValue({
        Items: mockOrders,
        LastEvaluatedKey: lastKey,
      });

      const result = await repository.getByCustomerId('customer-456', {
        limit: 1,
      });

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.lastEvaluatedKey).toEqual(lastKey);
    });
  });

  describe('getByStatus', () => {
    it('should return orders with specific status', async () => {
      const mockOrders = [
        {
          PK: 'order-1',
          orderId: 'order-1',
          customerId: 'customer-456',
          items: [],
          totalAmount: 1000,
          status: OrderStatus.PENDING,
          shippingAddress: {} as any,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          PK: 'order-2',
          orderId: 'order-2',
          customerId: 'customer-789',
          items: [],
          totalAmount: 2000,
          status: OrderStatus.PENDING,
          shippingAddress: {} as any,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      (dynamoClient.send as jest.Mock).mockResolvedValue({
        Items: mockOrders,
      });

      const result = await repository.getByStatus(OrderStatus.PENDING);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].status).toBe(OrderStatus.PENDING);
      expect(result.items[1].status).toBe(OrderStatus.PENDING);
    });

    it('should return empty array when no orders found', async () => {
      (dynamoClient.send as jest.Mock).mockResolvedValue({
        Items: [],
      });

      const result = await repository.getByStatus(OrderStatus.CANCELLED);

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should cancel order by updating status', async () => {
      const cancelledOrder = {
        PK: 'order-123',
        orderId: 'order-123',
        customerId: 'customer-456',
        items: [],
        totalAmount: 1000,
        status: OrderStatus.CANCELLED,
        shippingAddress: {} as any,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      (dynamoClient.send as jest.Mock).mockResolvedValue({
        Attributes: cancelledOrder,
      });

      const result = await repository.cancel('order-123');

      expect(result.status).toBe(OrderStatus.CANCELLED);
    });
  });

  describe('exists', () => {
    it('should return true when order exists', async () => {
      (dynamoClient.send as jest.Mock).mockResolvedValue({
        Item: { orderId: 'order-123' },
      });

      const result = await repository.exists('order-123');

      expect(result).toBe(true);
    });

    it('should return false when order does not exist', async () => {
      (dynamoClient.send as jest.Mock).mockResolvedValue({});

      const result = await repository.exists('non-existent');

      expect(result).toBe(false);
    });
  });
});
