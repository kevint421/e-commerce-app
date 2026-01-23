#!/usr/bin/env python3
import os
import aws_cdk as cdk

from infrastructure.stacks import (
    DatabaseStack,
    LambdaStack,
    ApiGatewayStack,
    StepFunctionsStack,
    MonitoringStack,
    FrontendStack,
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

# Monitoring Stack - CloudWatch Dashboards & Alarms
monitoring_stack = MonitoringStack(
    app,
    "EcommerceMonitoringStack",
    lambda_stack=lambda_stack,
    api_gateway_stack=api_gateway_stack,
    stepfunctions_stack=stepfunctions_stack,
    alarm_email=os.getenv('ALARM_EMAIL'),  # Optional: Set ALARM_EMAIL env var for notifications
    env=env,
    description="CloudWatch dashboards, alarms, and observability"
)

# Frontend Stack - S3 + CloudFront for React App
frontend_stack = FrontendStack(
    app,
    "EcommerceFrontendStack",
    api_url=api_gateway_stack.api.url,  # Pass API URL to frontend
    env=env,
    description="S3 + CloudFront hosting for React frontend"
)

# Add dependencies
lambda_stack.add_dependency(database_stack)
api_gateway_stack.add_dependency(lambda_stack)
# StepFunctions must be deployed after Lambda (needs Lambda function exports)
stepfunctions_stack.add_dependency(lambda_stack)
# Monitoring must be deployed after all other stacks
monitoring_stack.add_dependency(lambda_stack)
monitoring_stack.add_dependency(api_gateway_stack)
monitoring_stack.add_dependency(stepfunctions_stack)
# Frontend must be deployed after API Gateway (needs API URL)
frontend_stack.add_dependency(api_gateway_stack)

# Add tags to all resources
cdk.Tags.of(app).add("Project", "EcommerceOrderFulfillment")
cdk.Tags.of(app).add("Environment", "Development")
cdk.Tags.of(app).add("ManagedBy", "CDK")

app.synth()