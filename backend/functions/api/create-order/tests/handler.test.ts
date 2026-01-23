import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';

// Mock the shared module
jest.mock('ecommerce-backend-shared', () => ({
  OrderRepository: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({
      orderId: 'test-order-123',
      customerId: 'customer-456',
      items: [
        {
          productId: 'product-1',
          productName: 'Test Product',
          quantity: 2,
          pricePerUnit: 1999,
          totalPrice: 3998,
        },
      ],
      totalAmount: 3998,
      status: 'PENDING',
      shippingAddress: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'US',
      },
      paymentIntentId: 'pi_test_123',
      paymentStatus: 'pending',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }),
  })),
  ProductRepository: jest.fn().mockImplementation(() => ({
    getByIds: jest.fn().mockResolvedValue([
      {
        productId: 'product-1',
        name: 'Test Product',
        price: 1999,
        active: true,
      },
    ]),
  })),
  InventoryRepository: jest.fn().mockImplementation(() => ({
    findWarehouseWithStock: jest.fn().mockResolvedValue({
      warehouseId: 'warehouse-east',
      productId: 'product-1',
      quantity: 100,
      reserved: 10,
      version: 1,
    }),
  })),
  IdempotencyService: Object.assign(
    jest.fn().mockImplementation(() => ({
      executeOnce: jest.fn((key, operation, fn) => fn()),
    })),
    {
      generateOrderKey: jest.fn((customerId, requestId) => `order-${customerId}-${requestId}`),
    }
  ),
  createPaymentIntent: jest.fn().mockResolvedValue({
    id: 'pi_test_123',
    client_secret: 'pi_test_123_secret_456',
    amount: 3998,
    currency: 'usd',
    status: 'requires_payment_method',
  }),
  OrderStatus: {
    PENDING: 'PENDING',
    INVENTORY_RESERVED: 'INVENTORY_RESERVED',
    PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
    SHIPPING_ALLOCATED: 'SHIPPING_ALLOCATED',
    CANCELLED: 'CANCELLED',
    FAILED: 'FAILED',
  },
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    setContext: jest.fn(),
  },
  validateRequired: jest.fn(() => undefined), // No-op validation
  validateOrderItems: jest.fn(() => undefined), // No-op validation
  validateAddress: jest.fn(() => undefined), // No-op validation
  generateId: jest.fn(() => 'test-order-123'),
  getCurrentTimestamp: jest.fn(() => '2024-01-01T00:00:00.000Z'),
}));

describe('CreateOrder Lambda Handler', () => {
  const mockEvent: APIGatewayProxyEvent = {
    body: JSON.stringify({
      customerId: 'customer-456',
      items: [
        {
          productId: 'product-1',
          quantity: 2,
        },
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'US',
      },
    }),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/orders',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      path: '/orders',
      stage: 'test',
      requestId: 'test-request-id',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200000,
      identity: {
        cognitoIdentityPoolId: null,
        accountId: null,
        cognitoIdentityId: null,
        caller: null,
        sourceIp: '127.0.0.1',
        principalOrgId: null,
        accessKey: null,
        cognitoAuthenticationType: null,
        cognitoAuthenticationProvider: null,
        userArn: null,
        userAgent: 'test-agent',
        user: null,
        apiKey: null,
        apiKeyId: null,
        clientCert: null,
      },
      authorizer: null,
      resourceId: 'test-resource',
      resourcePath: '/orders',
    },
    resource: '/orders',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create order and return 201 with clientSecret', async () => {
    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('orderId');
    expect(body).toHaveProperty('clientSecret');
    expect(body).toHaveProperty('totalAmount');
    expect(body).toHaveProperty('status');
    expect(body.orderId).toBe('test-order-123');
    expect(body.status).toBe('PENDING');
  });

  it('should return 400 when body is missing', async () => {
    const invalidEvent = { ...mockEvent, body: null };

    const result = await handler(invalidEvent);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('Request body is required');
  });

  it('should return 400 when body is invalid JSON', async () => {
    const invalidEvent = { ...mockEvent, body: 'invalid-json' };

    const result = await handler(invalidEvent);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Invalid JSON in request body');
  });

  it('should include CORS headers in response', async () => {
    const result = await handler(mockEvent);

    expect(result.headers).toHaveProperty('Access-Control-Allow-Origin');
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});
