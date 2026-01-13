#!/usr/bin/env python3
import os
import aws_cdk as cdk

from infrastructure.stacks import (
    DatabaseStack,
    LambdaStack,
    ApiGatewayStack,
    StepFunctionsStack,
)

app = cdk.App()

# env config
env = cdk.Environment(
    account=os.getenv('CDK_DEFAULT_ACCOUNT'),
    region=os.getenv('CDK_DEFAULT_REGION', 'us-east-2')
)

# Database Stack - DynamoDB
database_stack = DatabaseStack(
    app,
    "EcommerceDatabaseStack",
    env=env,
    description="DynamoDB tables for e-commerce order fulfillment system"
)

# Lambda Stack
lambda_stack = LambdaStack(
    app,
    "EcommerceLambdaStack",
    database_stack=database_stack,
    env=env,
    description="Lambda functions for API and event processing"
)

# API Gateway Stack - REST API
api_gateway_stack = ApiGatewayStack(
    app,
    "EcommerceApiGatewayStack",
    lambda_stack=lambda_stack,
    env=env,
    description="API Gateway REST API for order management"
)

# Step Functions Stack - Saga Orchestrator
stepfunctions_stack = StepFunctionsStack(
    app,
    "EcommerceStepFunctionsStack",
    env=env,
    description="Step Functions state machine for order fulfillment saga"
)

# Add dependencies
lambda_stack.add_dependency(database_stack)
api_gateway_stack.add_dependency(lambda_stack)
# StepFunctions must be deployed after Lambda (needs Lambda function exports)
stepfunctions_stack.add_dependency(lambda_stack)

# Add tags to all resources
cdk.Tags.of(app).add("Project", "EcommerceOrderFulfillment")
cdk.Tags.of(app).add("Environment", "Development")
cdk.Tags.of(app).add("ManagedBy", "CDK")

app.synth()