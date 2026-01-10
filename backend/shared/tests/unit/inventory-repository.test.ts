jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('../../src/utils/dynamodb-client', () => ({
  dynamoClient: {
    send: jest.fn(),
  },
  handleDynamoDBError: jest.fn((error) => { throw error; }),
  withRetry: jest.fn((fn) => fn()),
  getCurrentTimestamp: jest.fn(() => '2024-01-01T00:00:00.000Z'),
  getTableName: jest.fn((name) => 'test-table'),
  buildVersionCondition: jest.fn((version) => ({
    ConditionExpression: 'version = :expectedVersion',
    ExpressionAttributeValues: { ':expectedVersion': version },
  })),
}));

import { InventoryRepository } from '../../src/repositories/inventory-repository';
import { Inventory } from '../../src/types';
import { dynamoClient } from '../../src/utils/dynamodb-client';
import {
  createMockInventory,
  mockDynamoDBGetResponse,
  mockDynamoDBUpdateResponse,
  mockDynamoDBQueryResponse,
  createConditionalCheckFailedError,
  TEST_TIMESTAMP,
} from '../fixtures/test-data';

describe('InventoryRepository', () => {
  let repository: InventoryRepository;
  const mockTableName = 'test-inventory-table';

  beforeAll(() => {
    process.env.INVENTORY_TABLE_NAME = mockTableName;
  });

  beforeEach(() => {
    repository = new InventoryRepository();
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create new inventory record', async () => {
      const newInventory = createMockInventory({
        productId: 'prod-123',
        warehouseId: 'warehouse-1',
        quantity: 100,
        reserved: 0,
        version: 0,
      });

      (dynamoClient.send as jest.Mock).mockResolvedValue({});

      const result = await repository.create(newInventory);

      expect(result.productId).toBe('prod-123');
      expect(result.quantity).toBe(100);
      expect(result.version).toBe(0);
      expect(dynamoClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    it('should get inventory by product and warehouse', async () => {
      const mockInventory = createMockInventory();
      
      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBGetResponse({
          PK: 'prod-123#warehouse-1',
          ...mockInventory,
        })
      );

      const result = await repository.get('prod-123', 'warehouse-1');

      expect(result).not.toBeNull();
      expect(result?.productId).toBe(mockInventory.productId);
      expect(result?.warehouseId).toBe(mockInventory.warehouseId);
    });

    it('should return null when inventory not found', async () => {
      (dynamoClient.send as jest.Mock).mockResolvedValue({});

      const result = await repository.get('nonexistent', 'warehouse-1');

      expect(result).toBeNull();
    });
  });

  describe('reserve', () => {
    it('should reserve inventory with optimistic locking', async () => {
      const updatedInventory = createMockInventory({
        quantity: 98,
        reserved: 12,
        version: 2,
      });

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBUpdateResponse({
          PK: 'prod-123#warehouse-1',
          ...updatedInventory,
        })
      );

      const result = await repository.reserve('prod-123', 'warehouse-1', 2, 1);

      expect(result.quantity).toBe(98);
      expect(result.reserved).toBe(12);
      expect(result.version).toBe(2);
    });

    it('should throw error on version mismatch', async () => {
      (dynamoClient.send as jest.Mock).mockRejectedValue(
        createConditionalCheckFailedError()
      );

      await expect(
        repository.reserve('prod-123', 'warehouse-1', 2, 1)
      ).rejects.toThrow('Inventory reservation failed');
    });

    it('should throw error on insufficient stock', async () => {
      (dynamoClient.send as jest.Mock).mockRejectedValue(
        createConditionalCheckFailedError()
      );

      await expect(
        repository.reserve('prod-123', 'warehouse-1', 1000, 1)
      ).rejects.toThrow();
    });
  });

  describe('release', () => {
    it('should release reserved inventory', async () => {
      const updatedInventory = createMockInventory({
        quantity: 102,
        reserved: 8,
        version: 2,
      });

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBUpdateResponse({
          PK: 'prod-123#warehouse-1',
          ...updatedInventory,
        })
      );

      const result = await repository.release('prod-123', 'warehouse-1', 2, 1);

      expect(result.quantity).toBe(102);
      expect(result.reserved).toBe(8);
      expect(result.version).toBe(2);
    });

    it('should throw error on version mismatch', async () => {
      (dynamoClient.send as jest.Mock).mockRejectedValue(
        createConditionalCheckFailedError()
      );

      await expect(
        repository.release('prod-123', 'warehouse-1', 2, 1)
      ).rejects.toThrow('Inventory release failed');
    });
  });

  describe('confirmShipment', () => {
    it('should confirm shipment by reducing reserved count', async () => {
      const updatedInventory = createMockInventory({
        quantity: 100,
        reserved: 8,
        version: 2,
      });

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBUpdateResponse({
          PK: 'prod-123#warehouse-1',
          ...updatedInventory,
        })
      );

      const result = await repository.confirmShipment('prod-123', 'warehouse-1', 2, 1);

      expect(result.reserved).toBe(8);
      expect(result.version).toBe(2);
    });
  });

  describe('restock', () => {
    it('should add inventory quantity', async () => {
      const updatedInventory = createMockInventory({
        quantity: 200,
        version: 2,
      });

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBUpdateResponse({
          PK: 'prod-123#warehouse-1',
          ...updatedInventory,
        })
      );

      const result = await repository.restock('prod-123', 'warehouse-1', 100, 1);

      expect(result.quantity).toBe(200);
      expect(result.version).toBe(2);
    });
  });

  describe('getByProductId', () => {
    it('should get all inventory for a product across warehouses', async () => {
      const inventoryList = [
        createMockInventory({ warehouseId: 'warehouse-1', quantity: 100 }),
        createMockInventory({ warehouseId: 'warehouse-2', quantity: 50 }),
      ];

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBQueryResponse(
          inventoryList.map(inv => ({ PK: inv.inventoryId, ...inv }))
        )
      );

      const result = await repository.getByProductId('prod-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].warehouseId).toBe('warehouse-1');
      expect(result.items[1].warehouseId).toBe('warehouse-2');
    });
  });

  describe('getTotalAvailableQuantity', () => {
    it('should sum quantity across all warehouses', async () => {
      const inventoryList = [
        createMockInventory({ warehouseId: 'warehouse-1', quantity: 100 }),
        createMockInventory({ warehouseId: 'warehouse-2', quantity: 50 }),
        createMockInventory({ warehouseId: 'warehouse-3', quantity: 25 }),
      ];

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBQueryResponse(
          inventoryList.map(inv => ({ PK: inv.inventoryId, ...inv }))
        )
      );

      const total = await repository.getTotalAvailableQuantity('prod-123');

      expect(total).toBe(175);
    });
  });

  describe('findWarehouseWithStock', () => {
    it('should find warehouse with sufficient stock', async () => {
      const inventoryList = [
        createMockInventory({ warehouseId: 'warehouse-1', quantity: 10 }),
        createMockInventory({ warehouseId: 'warehouse-2', quantity: 50 }),
        createMockInventory({ warehouseId: 'warehouse-3', quantity: 100 }),
      ];

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBQueryResponse(
          inventoryList.map(inv => ({ PK: inv.inventoryId, ...inv }))
        )
      );

      const result = await repository.findWarehouseWithStock('prod-123', 20);

      expect(result).not.toBeNull();
      expect(result?.warehouseId).toBe('warehouse-2');
      expect(result?.quantity).toBeGreaterThanOrEqual(20);
    });

    it('should return null when no warehouse has sufficient stock', async () => {
      const inventoryList = [
        createMockInventory({ warehouseId: 'warehouse-1', quantity: 5 }),
        createMockInventory({ warehouseId: 'warehouse-2', quantity: 8 }),
      ];

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBQueryResponse(
          inventoryList.map(inv => ({ PK: inv.inventoryId, ...inv }))
        )
      );

      const result = await repository.findWarehouseWithStock('prod-123', 20);

      expect(result).toBeNull();
    });
  });

  describe('hasStock', () => {
    it('should return true when sufficient stock exists', async () => {
      const inventoryList = [
        createMockInventory({ quantity: 100 }),
        createMockInventory({ quantity: 50 }),
      ];

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBQueryResponse(
          inventoryList.map(inv => ({ PK: inv.inventoryId, ...inv }))
        )
      );

      const result = await repository.hasStock('prod-123', 100);

      expect(result).toBe(true);
    });

    it('should return false when insufficient stock exists', async () => {
      const inventoryList = [
        createMockInventory({ quantity: 10 }),
        createMockInventory({ quantity: 15 }),
      ];

      (dynamoClient.send as jest.Mock).mockResolvedValue(
        mockDynamoDBQueryResponse(
          inventoryList.map(inv => ({ PK: inv.inventoryId, ...inv }))
        )
      );

      const result = await repository.hasStock('prod-123', 100);

      expect(result).toBe(false);
    });
  });
});
