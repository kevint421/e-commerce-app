import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger, getCurrentTimestamp } from 'ecommerce-backend-shared';
import * as crypto from 'crypto';

const secretsClient = new SecretsManagerClient({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ADMIN_SESSIONS_TABLE = process.env.ADMIN_SESSIONS_TABLE_NAME!;

// Cache credentials to avoid repeated Secrets Manager calls
let cachedCredentials: { username: string; password: string } | null = null;

async function getAdminCredentials(): Promise<{ username: string; password: string }> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: 'ecommerce/admin/credentials',
      })
    );

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secret = JSON.parse(response.SecretString);
    cachedCredentials = {
      username: secret.username,
      password: secret.password,
    };

    return cachedCredentials;
  } catch (error: any) {
    logger.error('Failed to retrieve admin credentials from Secrets Manager', error);
    // Do not fallback to hardcoded credentials - throw error instead
    throw new Error('Admin credentials unavailable - Secrets Manager access failed');
  }
}

/**
 * Admin Authentication Lambda
 * POST /admin/auth
 *
 * Simple authentication for admin dashboard
 * Validates credentials against AWS Secrets Manager
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  logger.info('Admin auth request received');

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { username, password } = body;

    // Validate input
    if (!username || !password) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Username and password are required',
        }),
      };
    }

    // Get admin credentials from Secrets Manager
    const { username: adminUsername, password: adminPassword } = await getAdminCredentials();

    // Validate credentials
    if (username !== adminUsername || password !== adminPassword) {
      logger.warn('Invalid admin credentials attempt', { username });

      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Invalid credentials',
        }),
      };
    }

    // Generate a secure session token
    const sessionToken = crypto
      .createHash('sha256')
      .update(`${username}:${Date.now()}:${crypto.randomBytes(32).toString('hex')}`)
      .digest('hex');

    // Calculate expiration (24 hours from now)
    const expiresAt = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const expiresAtISO = new Date(expiresAt * 1000).toISOString();

    // Store session token in DynamoDB
    await dynamoClient.send(
      new PutCommand({
        TableName: ADMIN_SESSIONS_TABLE,
        Item: {
          sessionToken,
          username: adminUsername,
          createdAt: getCurrentTimestamp(),
          expiresAt, // Unix timestamp for TTL
          expiresAtISO, // Human-readable expiration
        },
      })
    );

    logger.info('Admin login successful', { username, expiresAt: expiresAtISO });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        token: sessionToken,
        username: adminUsername,
        expiresAt: expiresAtISO,
        timestamp: getCurrentTimestamp(),
      }),
    };
  } catch (error: any) {
    logger.error('Admin auth error', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: getCurrentTimestamp(),
      }),
    };
  }
};
