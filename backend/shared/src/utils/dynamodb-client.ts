import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Client Configuration
 * Singleton pattern for reusing connections across Lambda invocations
 */
class DynamoDBClientManager {
  private static instance: DynamoDBDocumentClient;

  static getClient(): DynamoDBDocumentClient {
    if (!this.instance) {
      const client = new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-east-2',
      });

      this.instance = DynamoDBDocumentClient.from(client, {
        marshallOptions: {
          removeUndefinedValues: true,
          convertEmptyValues: false,
        },
        unmarshallOptions: {
          wrapNumbers: false,
        },
      });
    }

    return this.instance;
  }
}

export const dynamoClient = DynamoDBClientManager.getClient();

/**
 * DynamoDB Error Handler
 */
export class DynamoDBError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'DynamoDBError';
  }
}

/**
 * Handle DynamoDB exceptions with better error messages
 */
export function handleDynamoDBError(error: any): never {
  console.error('DynamoDB Error:', error);

  if (error.name === 'ConditionalCheckFailedException') {
    throw new DynamoDBError(
      'Conditional check failed - item may have been modified',
      'CONDITIONAL_CHECK_FAILED',
      400
    );
  }

  if (error.name === 'ResourceNotFoundException') {
    throw new DynamoDBError(
      'Resource not found',
      'RESOURCE_NOT_FOUND',
      404
    );
  }

  if (error.name === 'ValidationException') {
    throw new DynamoDBError(
      'Invalid request parameters',
      'VALIDATION_ERROR',
      400
    );
  }

  if (error.name === 'ProvisionedThroughputExceededException') {
    throw new DynamoDBError(
      'Request rate too high - throttled',
      'THROTTLED',
      429
    );
  }

  throw new DynamoDBError(
    error.message || 'Unknown DynamoDB error',
    'UNKNOWN_ERROR',
    500
  );
}

/**
 * Retry logic for throttled requests
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Only retry on throttling errors
      if (
        error.name === 'ProvisionedThroughputExceededException' &&
        attempt < maxRetries
      ) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Generate timestamps
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Generate TTL (Time To Live) timestamp
 * @param daysFromNow Number of days from now
 */
export function getTTLTimestamp(daysFromNow: number = 7): number {
  const now = Date.now();
  const ttl = now + daysFromNow * 24 * 60 * 60 * 1000;
  return Math.floor(ttl / 1000); // Convert to seconds (DynamoDB TTL format)
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build DynamoDB condition expression for optimistic locking
 */
export function buildVersionCondition(expectedVersion: number): {
  ConditionExpression: string;
  ExpressionAttributeValues: Record<string, any>;
} {
  return {
    ConditionExpression: 'version = :expectedVersion',
    ExpressionAttributeValues: {
      ':expectedVersion': expectedVersion,
    },
  };
}

/**
 * Build update expression from object
 */
export function buildUpdateExpression(updates: Record<string, any>): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, any>;
} {
  const attributeNames: Record<string, string> = {};
  const attributeValues: Record<string, any> = {};
  const setParts: string[] = [];

  Object.entries(updates).forEach(([key, value], index) => {
    const nameKey = `#attr${index}`;
    const valueKey = `:val${index}`;

    attributeNames[nameKey] = key;
    attributeValues[valueKey] = value;
    setParts.push(`${nameKey} = ${valueKey}`);
  });

  return {
    UpdateExpression: `SET ${setParts.join(', ')}`,
    ExpressionAttributeNames: attributeNames,
    ExpressionAttributeValues: attributeValues,
  };
}

/**
 * Pagination helper
 */
export interface PaginationParams {
  limit?: number;
  lastEvaluatedKey?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  hasMore: boolean;
}

export function buildPaginatedResponse<T>(
  items: T[],
  lastEvaluatedKey?: Record<string, any>
): PaginatedResponse<T> {
  return {
    items,
    lastEvaluatedKey,
    hasMore: !!lastEvaluatedKey,
  };
}

/**
 * Validate required environment variables
 */
export function validateEnvironment(requiredVars: string[]): void {
  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Get table name from environment
 */
export function getTableName(tableEnvVar: string): string {
  const tableName = process.env[tableEnvVar];
  if (!tableName) {
    throw new Error(`Environment variable ${tableEnvVar} is not set`);
  }
  return tableName;
}

/**
 * Batch operations helper
 */
export async function batchGet<T>(
  tableName: string,
  keys: Record<string, any>[]
): Promise<T[]> {
  // basic implementation
  // TODO: use BatchGetItemCommand with proper error handling
  const results: T[] = [];

  for (const key of keys) {
    try {
      const response = await dynamoClient.send(
        new GetCommand({
          TableName: tableName,
          Key: key,
        })
      );

      if (response.Item) {
        results.push(response.Item as T);
      }
    } catch (error) {
      console.error('Error in batch get:', error);
      // Continue with other items
    }
  }

  return results;
}

/**
 * Type guard for checking if error is DynamoDB error
 */
export function isDynamoDBError(error: any): error is DynamoDBError {
  return error instanceof DynamoDBError;
}
