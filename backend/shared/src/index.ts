/**
 * Main export file for shared backend code
 * Import all repositories, services, utilities, and types from here
 */

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

export {
  logger,
  Logger,
  LogLevel,
} from './utils/logger';

export {
  ValidationError,
  validateEmail,
  validateUUID,
  validateRequired,
  validatePositiveNumber,
  validateNonNegativeNumber,
  validateStringLength,
  validateNonEmptyArray,
  validateEnum,
  validateAddress,
  validateOrderItems,
  validatePrice,
  sanitizeString,
  sanitizeObject,
} from './utils/validators';

// Repositories
export { OrderRepository } from './repositories/order-repository';
export { ProductRepository } from './repositories/product-repository';
export { InventoryRepository } from './repositories/inventory-repository';

// Services
export { IdempotencyService } from './services/idempotency-service';
export { EventPublisher } from './services/event-publisher';
export {
  getStripeClient,
  createPaymentIntent,
  confirmPaymentIntent,
  createAndConfirmPayment,
  createRefund,
  getPaymentIntent,
} from './services/stripe-service';
export {
  sendOrderConfirmationEmail,
  sendShippingNotificationEmail,
  sendAbandonedCartReminderEmail,
  OrderConfirmationData,
  ShippingNotificationData,
  AbandonedCartReminderData,
} from './services/email-service';

/**
 * Usage Example:
 * 
 * import {
 *   OrderRepository,
 *   ProductRepository,
 *   InventoryRepository,
 *   IdempotencyService,
 *   OrderStatus,
 *   logger,
 *   validateRequired,
 * } from 'ecommerce-backend-shared';
 * 
 * // Set up logging context
 * logger.setContext({ requestId: 'req-123' });
 * 
 * // Create repositories
 * const orderRepo = new OrderRepository();
 * const inventoryRepo = new InventoryRepository();
 * 
 * // Validate input
 * validateRequired(orderData, ['orderId', 'customerId', 'items']);
 * 
 * // Use repositories
 * const order = await orderRepo.getById('order-123');
 * logger.info('Order retrieved', { orderId: order.orderId });
 * 
 * // Reserve inventory with idempotency
 * const idempotency = new IdempotencyService();
 * await idempotency.executeOnce('reserve:order-123', 'reserve', async () => {
 *   const inv = await inventoryRepo.get('prod-1', 'warehouse-1');
 *   return await inventoryRepo.reserve('prod-1', 'warehouse-1', 2, inv.version);
 * });
 */
