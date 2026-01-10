jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('../../src/utils/dynamodb-client', () => ({
  dynamoClient: {
    send: jest.fn(),
  },
  handleDynamoDBError: jest.fn((error) => { throw error; }),
  getCurrentTimestamp: jest.fn(() => '2024-01-01T00:00:00.000Z'),
  getTTLTimestamp: jest.fn(() => 1234567890),
  getTableName: jest.fn((name) => 'test-table'),
}));

import { IdempotencyService } from '../../src/services/idempotency-service';
import { dynamoClient } from '../../src/utils/dynamodb-client';
import {
  mockDynamoDBGetResponse,
  createConditionalCheckFailedError,
} from '../fixtures/test-data';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  const mockTableName = 'test-idempotency-table';

  beforeAll(() => {
    process.env.IDEMPOTENCY_TABLE_NAME = mockTableName;
  });

  beforeEach(() => {
    service = new IdempotencyService();
    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should return existing idempotency key if found', async () => {
      const mockKey = {
        idempotencyKey: 'test-key',
        operation: 'test-operation',
        status: 'COMPLETED',
        result: { success: true },
        createdAt: '2024-01-01T00:00:00Z',
        expiresAt: 1234567890,
      };

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBGetResponse(mockKey)
      );

      const result = await service.check('test-key');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('COMPLETED');
      expect(result?.result).toEqual({ success: true });
    });

    it('should return null if key not found', async () => {
      (dynamoClient.send as jest.Mock).mockResolvedValue({});

      const result = await service.check('nonexistent-key');

      expect(result).toBeNull();
    });
  });

  describe('markInProgress', () => {
    it('should mark operation as in progress', async () => {
      (dynamoClient.send as jest.Mock).mockResolvedValue({});

      await service.markInProgress('test-key', 'payment');

      expect(dynamoClient.send).toHaveBeenCalledTimes(1);
    });

    it('should throw error if key already exists with COMPLETED status', async () => {
      const existingKey = {
        idempotencyKey: 'test-key',
        status: 'COMPLETED',
      };

      (dynamoClient.send as jest.Mock)
        .mockRejectedValueOnce(createConditionalCheckFailedError())
        .mockResolvedValueOnce(mockDynamoDBGetResponse(existingKey));

      await expect(
        service.markInProgress('test-key', 'payment')
      ).rejects.toThrow('Operation already completed');
    });

    it('should throw error if key already exists with IN_PROGRESS status', async () => {
      const existingKey = {
        idempotencyKey: 'test-key',
        status: 'IN_PROGRESS',
      };

      (dynamoClient.send as jest.Mock)
        .mockRejectedValueOnce(createConditionalCheckFailedError())
        .mockResolvedValueOnce(mockDynamoDBGetResponse(existingKey));

      await expect(
        service.markInProgress('test-key', 'payment')
      ).rejects.toThrow('Operation already in progress');
    });

    it('should allow retry if previous attempt failed', async () => {
      const existingKey = {
        idempotencyKey: 'test-key',
        status: 'FAILED',
      };

      (dynamoClient.send as jest.Mock)
        .mockRejectedValueOnce(createConditionalCheckFailedError())
        .mockResolvedValueOnce(mockDynamoDBGetResponse(existingKey));

      // Should not throw
      await service.markInProgress('test-key', 'payment');
    });
  });

  describe('markCompleted', () => {
    it('should mark operation as completed with result', async () => {
      const result = { orderId: 'order-123', success: true };

      (dynamoClient.send as jest.Mock).mockResolvedValue({});

      await service.markCompleted('test-key', result);

      expect(dynamoClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('markFailed', () => {
    it('should mark operation as failed', async () => {
      (dynamoClient.send as jest.Mock).mockResolvedValue({});

      await service.markFailed('test-key');

      expect(dynamoClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeOnce', () => {
    it('should execute operation and cache result', async () => {
      const mockOperation = jest.fn().mockResolvedValue({ data: 'result' });

      (dynamoClient.send as jest.Mock)
        // check - not found
        .mockResolvedValueOnce({})
        // markInProgress
        .mockResolvedValueOnce({})
        // markCompleted
        .mockResolvedValueOnce({});

      const result = await service.executeOnce('test-key', 'payment', mockOperation);

      expect(result).toEqual({ data: 'result' });
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(dynamoClient.send).toHaveBeenCalledTimes(3);
    });

    it('should return cached result if operation already completed', async () => {
      const cachedResult = { data: 'cached' };
      const mockOperation = jest.fn();

      const existingKey = {
        idempotencyKey: 'test-key',
        status: 'COMPLETED',
        result: cachedResult,
      };

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBGetResponse(existingKey)
      );

      const result = await service.executeOnce('test-key', 'payment', mockOperation);

      expect(result).toEqual(cachedResult);
      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should mark as failed if operation throws error', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      (dynamoClient.send as jest.Mock)
        // check - not found
        .mockResolvedValueOnce({})
        // markInProgress
        .mockResolvedValueOnce({})
        // markFailed
        .mockResolvedValueOnce({});

      await expect(
        service.executeOnce('test-key', 'payment', mockOperation)
      ).rejects.toThrow('Operation failed');

      expect(dynamoClient.send).toHaveBeenCalledTimes(3);
    });
  });

  describe('Key generation helpers', () => {
    it('should generate order key', () => {
      const key = IdempotencyService.generateOrderKey('order-123', 'create');
      expect(key).toBe('order:order-123:create');
    });

    it('should generate payment key', () => {
      const key = IdempotencyService.generatePaymentKey('order-123', 'pi_abc');
      expect(key).toBe('payment:order-123:pi_abc');
    });

    it('should generate inventory key', () => {
      const key = IdempotencyService.generateInventoryKey('order-123', 'prod-456', 'reserve');
      expect(key).toBe('inventory:order-123:prod-456:reserve');
    });
  });
});

