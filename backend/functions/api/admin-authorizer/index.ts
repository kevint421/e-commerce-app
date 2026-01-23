import { APIGatewayTokenAuthorizerHandler, APIGatewayAuthorizerResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ADMIN_SESSIONS_TABLE = process.env.ADMIN_SESSIONS_TABLE_NAME!;

interface AdminSession {
  sessionToken: string;
  username: string;
  createdAt: string;
  expiresAt: number;
  expiresAtISO: string;
}

/**
 * Lambda Authorizer for Admin Endpoints
 *
 * Validates session tokens stored in DynamoDB
 * Returns IAM policy granting or denying access
 */
export const handler: APIGatewayTokenAuthorizerHandler = async (event): Promise<APIGatewayAuthorizerResult> => {
  console.log('Authorizer invoked', {
    authorizationToken: event.authorizationToken?.substring(0, 20) + '...',
    methodArn: event.methodArn
  });

  try {
    // Extract token from "Bearer <token>" format
    const token = event.authorizationToken?.replace('Bearer ', '');

    if (!token) {
      console.log('No token provided');
      throw new Error('Unauthorized');
    }

    // Look up session in DynamoDB
    const response = await dynamoClient.send(
      new GetCommand({
        TableName: ADMIN_SESSIONS_TABLE,
        Key: { sessionToken: token },
      })
    );

    if (!response.Item) {
      console.log('Session not found', { token: token.substring(0, 10) + '...' });
      throw new Error('Unauthorized');
    }

    const session = response.Item as AdminSession;

    // Check if session has expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (session.expiresAt < currentTime) {
      console.log('Session expired', {
        expiresAt: session.expiresAt,
        currentTime,
        username: session.username
      });
      throw new Error('Unauthorized');
    }

    console.log('Session valid', { username: session.username });

    // Generate IAM policy allowing access to ALL admin endpoints
    // Extract the base ARN and add wildcard for all admin resources
    // methodArn format: arn:aws:execute-api:region:account:apiId/stage/method/resource
    const arnParts = event.methodArn.split('/');
    const apiGatewayArnBase = arnParts.slice(0, 2).join('/'); // arn:aws:execute-api:region:account:apiId/stage
    const adminResourceArn = `${apiGatewayArnBase}/*/admin/*`; // Allow all methods on all /admin/* paths

    return generatePolicy(session.username, 'Allow', adminResourceArn, {
      username: session.username,
      sessionToken: token,
    });
  } catch (error) {
    console.error('Authorization failed', error);
    // Return deny policy
    throw new Error('Unauthorized');
  }
};

/**
 * Generate IAM policy for API Gateway
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult {
  const authResponse: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  // Add context that will be passed to the Lambda function
  if (context) {
    authResponse.context = context;
  }

  return authResponse;
}
