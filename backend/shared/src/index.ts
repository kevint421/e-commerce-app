//Main export file

// Types
export * from './types';

// Utilities
export {
  dynamoClient,
  DynamoDBError,
  handleDynamoDBError,
  withRetry,
  getCurrentTimestamp,
  getTTLTimestamp,
  generateId,
  buildVersionCondition,
  buildUpdateExpression,
  buildPaginatedResponse,
  validateEnvironment,
  getTableName,
  batchGet,
  isDynamoDBError,
} from './utils/dynamodb-client';

// Repositories
export { OrderRepository } from './repositories/order-repository';
export { ProductRepository } from './repositories/product-repository';
export { InventoryRepository } from './repositories/inventory-repository';
export { OrderEventRepository } from './repositories/order-event-repository';

// Services
export { IdempotencyService } from './services/idempotency-service';
