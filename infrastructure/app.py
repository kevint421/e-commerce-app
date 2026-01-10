#!/usr/bin/env python3
import os
import aws_cdk as cdk

from infrastructure.stacks import DatabaseStack, EventStack


app = cdk.App()

# env config
env = cdk.Environment(
    account=os.getenv('CDK_DEFAULT_ACCOUNT'),
    region=os.getenv('CDK_DEFAULT_REGION', 'us-east-2')
)

# Database Stack: DynamoDB tables
database_stack = DatabaseStack(
    app,
    "EcommerceDatabaseStack",
    env=env,
    description="DynamoDB tables for e-commerce order fulfillment system"
)

# Event Stack: EventBridge, SQS, SNS
event_stack = EventStack(
    app,
    "EcommerceEventStack",
    env=env,
    description="Event-driven architecture components for order fulfillment"
)

# add dependencies
event_stack.add_dependency(database_stack)

app.synth()
