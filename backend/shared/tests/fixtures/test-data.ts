import {
    Order,
    Product,
    Inventory,
    OrderEvent,
    OrderStatus,
    OrderEventType,
    ProductCategory,
    OrderItem,
    Address,
  } from '../../src/types';
  
  /**
   * Test Data Fixtures
   * Reusable test data for unit and integration tests
   */
  
  export const TEST_TIMESTAMP = '2024-01-01T00:00:00.000Z';
  
  export const mockAddress: Address = {
    street: '123 Test Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94102',
    country: 'US',
  };
  
  export const mockOrderItem: OrderItem = {
    productId: 'prod-test-123',
    productName: 'Test Product',
    quantity: 2,
    pricePerUnit: 1999, // $19.99
    totalPrice: 3998, // $39.98
  };
  
  export const mockOrder: Order = {
    orderId: 'order-test-123',
    customerId: 'customer-test-456',
    items: [mockOrderItem],
    totalAmount: 3998,
    status: OrderStatus.PENDING,
    shippingAddress: mockAddress,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
  
  export const mockProduct: Product = {
    productId: 'prod-test-123',
    name: 'Test Product',
    description: 'This is a test product for unit testing',
    price: 1999, // $19.99
    category: ProductCategory.ELECTRONICS,
    imageUrl: 'https://example.com/image.jpg',
    active: true,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
  
  export const mockInventory: Inventory = {
    inventoryId: 'prod-test-123#warehouse-1',
    productId: 'prod-test-123',
    warehouseId: 'warehouse-1',
    quantity: 100,
    reserved: 10,
    version: 1,
    updatedAt: TEST_TIMESTAMP,
  };
  
  export const mockOrderEvent: OrderEvent = {
    eventId: 'event-test-123',
    orderId: 'order-test-123',
    eventType: OrderEventType.ORDER_CREATED,
    timestamp: TEST_TIMESTAMP,
    payload: {
      orderId: 'order-test-123',
      customerId: 'customer-test-456',
      totalAmount: 3998,
    },
  };
  
  /**
   * Factory functions for creating test data with overrides
   */
  
  export function createMockOrder(overrides?: Partial<Order>): Order {
    return {
      ...mockOrder,
      ...overrides,
    };
  }
  
  export function createMockProduct(overrides?: Partial<Product>): Product {
    return {
      ...mockProduct,
      ...overrides,
    };
  }
  
  export function createMockInventory(overrides?: Partial<Inventory>): Inventory {
    return {
      ...mockInventory,
      ...overrides,
    };
  }
  
  export function createMockOrderEvent(overrides?: Partial<OrderEvent>): OrderEvent {
    return {
      ...mockOrderEvent,
      ...overrides,
    };
  }
  
  export function createMockOrderItem(overrides?: Partial<OrderItem>): OrderItem {
    return {
      ...mockOrderItem,
      ...overrides,
    };
  }
  
  export function createMockAddress(overrides?: Partial<Address>): Address {
    return {
      ...mockAddress,
      ...overrides,
    };
  }
  
  /**
   * DynamoDB mock responses
   */
  
  export const mockDynamoDBGetResponse = (item: any) => ({
    Item: item,
  });
  
  export const mockDynamoDBPutResponse = () => ({});
  
  export const mockDynamoDBUpdateResponse = (attributes: any) => ({
    Attributes: attributes,
  });
  
  export const mockDynamoDBQueryResponse = (items: any[], lastKey?: any) => ({
    Items: items,
    LastEvaluatedKey: lastKey,
  });
  
  export const mockDynamoDBBatchGetResponse = (tableName: string, items: any[]) => ({
    Responses: {
      [tableName]: items,
    },
  });
  
  /**
   * Error mocks
   */
  
  export function createConditionalCheckFailedError(): Error {
    const error = new Error('ConditionalCheckFailedException');
    error.name = 'ConditionalCheckFailedException';
    return error;
  }
  
  export function createResourceNotFoundError(): Error {
    const error = new Error('ResourceNotFoundException');
    error.name = 'ResourceNotFoundException';
    return error;
  }
  
  export function createThrottlingError(): Error {
    const error = new Error('ProvisionedThroughputExceededException');
    error.name = 'ProvisionedThroughputExceededException';
    return error;
  }
  
  /**
   * Usage Examples:
   * 
   * // Use default mock data
   * const order = mockOrder;
   * 
   * // Create with overrides
   * const cancelledOrder = createMockOrder({ status: OrderStatus.CANCELLED });
   * 
   * // Mock DynamoDB responses
   * (dynamoClient.send as jest.Mock).mockResolvedValue(
   *   mockDynamoDBGetResponse({ PK: 'order-123', ...mockOrder })
   * );
   * 
   * // Mock errors
   * (dynamoClient.send as jest.Mock).mockRejectedValue(
   *   createConditionalCheckFailedError()
   * );
   */
  