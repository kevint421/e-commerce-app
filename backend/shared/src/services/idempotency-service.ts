import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  dynamoClient,
  handleDynamoDBError,
  getCurrentTimestamp,
  getTTLTimestamp,
  getTableName,
} from '../utils/dynamodb-client';
import { IdempotencyKey, DynamoDBIdempotencyItem } from '../types';

/**
 * Idempotency Service
 * Prevents duplicate operations, critical for payment processing
 * 
 * Usage:
 * 1. Check if operation already performed
 * 2. Mark operation as in progress
 * 3. Perform operation
 * 4. Mark operation as complete with result
 * 
 * If step 3 fails, mark as failed and allow retry
 */
export class IdempotencyService {
  private tableName: string;

  constructor() {
    this.tableName = getTableName('IDEMPOTENCY_TABLE_NAME');
  }

  /**
   * Check if an operation has already been performed
   * Returns the result if operation completed, null if not found
   */
  async check(idempotencyKey: string): Promise<IdempotencyKey | null> {
    try {
      const response = await dynamoClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { idempotencyKey },
        })
      );

      if (!response.Item) {
        return null;
      }

      return response.Item as IdempotencyKey;
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Mark operation as in progress
   * Prevents concurrent duplicate operations
   */
  async markInProgress(idempotencyKey: string, operation: string): Promise<void> {
    const item: DynamoDBIdempotencyItem = {
      idempotencyKey,
      operation,
      status: 'IN_PROGRESS',
      createdAt: getCurrentTimestamp(),
      expiresAt: getTTLTimestamp(7), // Auto-delete after 7 days
    };

    try {
      await dynamoClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(idempotencyKey)',
        })
      );
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        // Key already exists - check status
        const existing = await this.check(idempotencyKey);
        
        if (existing?.status === 'COMPLETED') {
          throw new Error(
            `Operation already completed. Idempotency key: ${idempotencyKey}`
          );
        }

        if (existing?.status === 'IN_PROGRESS') {
          throw new Error(
            `Operation already in progress. Idempotency key: ${idempotencyKey}`
          );
        }

        // If FAILED, allow retry by deleting and recreating
        if (existing?.status === 'FAILED') {
          // In a real implementation, might want to add retry limits
          return;
        }
      }
      
      return handleDynamoDBError(error);
    }
  }

  /**
   * Mark operation as completed with result
   */
  async markCompleted(idempotencyKey: string, result: any): Promise<void> {
    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { idempotencyKey },
          UpdateExpression: 'SET #status = :completed, #result = :result',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#result': 'result',
          },
          ExpressionAttributeValues: {
            ':completed': 'COMPLETED',
            ':result': result,
          },
        })
      );
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Mark operation as failed (allows retry)
   */
  async markFailed(idempotencyKey: string): Promise<void> {
    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { idempotencyKey },
          UpdateExpression: 'SET #status = :failed',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':failed': 'FAILED',
          },
        })
      );
    } catch (error) {
      return handleDynamoDBError(error);
    }
  }

  /**
   * Execute operation with idempotency protection
   * High-level wrapper for common pattern
   */
  async executeOnce<T>(
    idempotencyKey: string,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    // Check if already completed
    const existing = await this.check(idempotencyKey);
    if (existing?.status === 'COMPLETED') {
      console.log(`Operation already completed, returning cached result: ${idempotencyKey}`);
      return existing.result as T;
    }

    // Mark as in progress
    await this.markInProgress(idempotencyKey, operation);

    try {
      // Execute the operation
      const result = await fn();

      // Mark as completed
      await this.markCompleted(idempotencyKey, result);

      return result;
    } catch (error) {
      // Mark as failed
      await this.markFailed(idempotencyKey);
      throw error;
    }
  }

  /**
   * Generate idempotency key for order operations
   */
  static generateOrderKey(orderId: string, operation: string): string {
    return `order:${orderId}:${operation}`;
  }

  /**
   * Generate idempotency key for payment operations
   */
  static generatePaymentKey(orderId: string, paymentId: string): string {
    return `payment:${orderId}:${paymentId}`;
  }

  /**
   * Generate idempotency key for inventory operations
   */
  static generateInventoryKey(
    orderId: string,
    productId: string,
    operation: 'reserve' | 'release'
  ): string {
    return `inventory:${orderId}:${productId}:${operation}`;
  }
}