"""
Lambda Stack - Defines all Lambda functions for the e-commerce system
"""

from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_lambda as _lambda,
    aws_lambda_event_sources as lambda_event_sources,
    aws_iam as iam,
    aws_logs as logs,
)
from constructs import Construct


class LambdaStack(Stack):
    """
    Lambda Stack
    
    Creates all Lambda functions with appropriate IAM permissions and configuration.
    Uses a shared Lambda Layer for common code.
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        database_stack,
        event_stack=None,  # Optional only needed forEventBridge orchestration
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Get resources from other stacks
        orders_table = database_stack.orders_table
        products_table = database_stack.products_table
        inventory_table = database_stack.inventory_table
        idempotency_table = database_stack.idempotency_table
        
        if event_stack:
            event_bus = event_stack.event_bus
            inventory_queue = event_stack.inventory_queue
            payment_queue = event_stack.payment_queue
            shipping_queue = event_stack.shipping_queue
            notification_queue = event_stack.notification_queue
        else:
            event_bus = None
            inventory_queue = None
            payment_queue = None
            shipping_queue = None
            notification_queue = None

        # Create Lambda Layer for shared code
        # need to build this first with: cd backend/shared && npm run build
        # Then create layer structure
        self.shared_layer = _lambda.LayerVersion(
            self,
            "SharedCodeLayer",
            code=_lambda.Code.from_asset("lambda-layer"),
            compatible_runtimes=[_lambda.Runtime.NODEJS_20_X],
            description="Shared data layer code (repositories, services, types)",
        )

        # Common environment variables for all Lambdas
        # Event sourcing handled by Step Functions execution history
        common_env = {
            "ORDERS_TABLE_NAME": orders_table.table_name,
            "PRODUCTS_TABLE_NAME": products_table.table_name,
            "INVENTORY_TABLE_NAME": inventory_table.table_name,
            "IDEMPOTENCY_TABLE_NAME": idempotency_table.table_name,
            "AWS_NODEJS_CONNECTION_REUSE_ENABLED": "1",  # Reuse HTTP connections
            "LOG_LEVEL": "INFO",
        }
        
        if event_bus:
            common_env["EVENT_BUS_NAME"] = event_bus.event_bus_name

        # ===== API Lambda Functions =====

        # POST /orders - Create Order
        self.create_order_fn = _lambda.Function(
            self,
            "CreateOrderFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/create-order/dist"),
            layers=[self.shared_layer],
            environment={
                **common_env,
                # Construct State Machine ARN from known pattern
                "STATE_MACHINE_ARN": f"arn:aws:states:{self.region}:{self.account}:stateMachine:OrderFulfillmentSaga"
            },
            timeout=Duration.seconds(30),
            memory_size=512,
            # Log groups created automatically by CDK
            description="Creates new orders and triggers Step Functions workflow",
        )
        
        # Grant permission to start Step Functions executions
        self.create_order_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["states:StartExecution"],
                resources=[f"arn:aws:states:{self.region}:{self.account}:stateMachine:OrderFulfillmentSaga"],
                effect=iam.Effect.ALLOW,
            )
        )

        # Grant permission to read Stripe API key from Secrets Manager
        self.create_order_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["secretsmanager:GetSecretValue"],
                resources=[f"arn:aws:secretsmanager:{self.region}:{self.account}:secret:ecommerce/stripe/*"],
            )
        )

        # GET /orders/{orderId} - Get Order
        self.get_order_fn = _lambda.Function(
            self,
            "GetOrderFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/get-order/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(10),
            memory_size=256,
            # Log groups created automatically by CDK
            description="Retrieves order details by ID",
        )

        # GET /products - List Products
        self.list_products_fn = _lambda.Function(
            self,
            "ListProductsFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/list-products/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(10),
            memory_size=256,
            # Log groups created automatically by CDK
            description="Lists products with filtering and search",
        )

        # GET /inventory/{productId} - Check Inventory
        self.check_inventory_fn = _lambda.Function(
            self,
            "CheckInventoryFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/check-inventory/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(10),
            memory_size=256,
            # Log groups created automatically by CDK
            description="Checks inventory availability for a product",
        )

        # POST /webhooks/stripe - Stripe Webhook Handler
        self.stripe_webhook_fn = _lambda.Function(
            self,
            "StripeWebhookFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/stripe-webhook/dist"),
            layers=[self.shared_layer],
            environment={
                **common_env,
                "STATE_MACHINE_ARN": f"arn:aws:states:{self.region}:{self.account}:stateMachine:OrderFulfillmentSaga",
                # Webhook secret will be stored in Secrets Manager (optional for local dev)
                # "STRIPE_WEBHOOK_SECRET": "whsec_..." # Set via Secrets Manager
            },
            timeout=Duration.seconds(30),
            memory_size=512,
            description="Handles Stripe webhook events (payment confirmations)",
        )

        # Grant webhook function permission to start Step Functions
        self.stripe_webhook_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["states:StartExecution"],
                resources=[f"arn:aws:states:{self.region}:{self.account}:stateMachine:OrderFulfillmentSaga"],
                effect=iam.Effect.ALLOW,
            )
        )

        # Grant webhook function permission to read Stripe secrets
        self.stripe_webhook_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["secretsmanager:GetSecretValue"],
                resources=[f"arn:aws:secretsmanager:{self.region}:{self.account}:secret:ecommerce/stripe/*"],
            )
        )

        orders_table.grant_read_write_data(self.stripe_webhook_fn)

        # ===== Step Functions Task Lambda Functions =====

        # Reserve Inventory - Step Functions task version
        self.reserve_inventory_fn = _lambda.Function(
            self,
            "ReserveInventoryStepFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/stepfunctions/reserve-inventory/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(60),
            memory_size=512,
            description="Reserves inventory for orders (Step Functions task)",
        )

        # Process Payment - Step Functions task version
        self.process_payment_fn = _lambda.Function(
            self,
            "ProcessPaymentStepFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/stepfunctions/process-payment/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=256,
            description="Processes payments with idempotency (Step Functions task)",
        )

        # Allocate Shipping - Step Functions task version
        self.allocate_shipping_fn = _lambda.Function(
            self,
            "AllocateShippingStepFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/stepfunctions/allocate-shipping/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=256,
            description="Allocates shipping and generates tracking (Step Functions task)",
        )

        # Send Notification - Step Functions task version
        self.send_notification_fn = _lambda.Function(
            self,
            "SendNotificationStepFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/stepfunctions/send-notification/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=256,
            description="Sends order confirmation notifications (Step Functions task)",
        )

        # Compensation Handler - Rolls back failed transactions
        self.compensation_handler_fn = _lambda.Function(
            self,
            "CompensationHandlerFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/events/compensation-handler/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(60),
            memory_size=512,
            description="Handles compensation/rollback for failed sagas",
        )

        # ===== Grant Permissions =====

        # API Functions need read/write access to tables
        for fn in [self.create_order_fn, self.get_order_fn, self.list_products_fn, self.check_inventory_fn]:
            orders_table.grant_read_write_data(fn)
            products_table.grant_read_write_data(fn)
            inventory_table.grant_read_write_data(fn)
            idempotency_table.grant_read_write_data(fn)
            if event_bus:
                event_bus.grant_put_events_to(fn)

        # ===== Step Functions Task Lambda Permissions =====

        # Grant reserve inventory access to DynamoDB
        orders_table.grant_read_write_data(self.reserve_inventory_fn)
        inventory_table.grant_read_write_data(self.reserve_inventory_fn)

        # Grant process payment access to DynamoDB
        orders_table.grant_read_write_data(self.process_payment_fn)
        idempotency_table.grant_read_write_data(self.process_payment_fn)
        
        # Grant access to Stripe secret in Secrets Manager
        self.process_payment_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["secretsmanager:GetSecretValue"],
                resources=[
                    f"arn:aws:secretsmanager:{self.region}:{self.account}:secret:ecommerce/stripe/*"
                ]
            )
        )

        # Grant allocate shipping access to DynamoDB
        orders_table.grant_read_write_data(self.allocate_shipping_fn)

        # Grant send notification access to DynamoDB and SES
        orders_table.grant_read_data(self.send_notification_fn)
        self.send_notification_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["ses:SendEmail", "ses:SendRawEmail"],
                resources=["*"],  # TODO: In production, scope this down to specific email addresses
            )
        )

        # Grant compensation handler access to DynamoDB
        orders_table.grant_read_write_data(self.compensation_handler_fn)
        inventory_table.grant_read_write_data(self.compensation_handler_fn)
        
        # Grant access to Stripe secret for refunds
        self.compensation_handler_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["secretsmanager:GetSecretValue"],
                resources=[
                    f"arn:aws:secretsmanager:{self.region}:{self.account}:secret:ecommerce/stripe/*"
                ]
            )
        )

        # Store references for other stacks
        self.api_functions = {
            "create_order": self.create_order_fn,
            "get_order": self.get_order_fn,
            "list_products": self.list_products_fn,
            "check_inventory": self.check_inventory_fn,
            "stripe_webhook": self.stripe_webhook_fn,
        }
        
        # ===== Export Lambda ARNs for Step Functions Stack =====
        # These exports allow StepFunctionsStack to reference Lambda functions
        # without creating circular dependencies
        
        CfnOutput(
            self,
            "ReserveInventoryFunctionArnOutput",
            value=self.reserve_inventory_fn.function_arn,
            export_name="ReserveInventoryFunctionArn",
            description="Reserve Inventory Lambda ARN for Step Functions",
        )
        
        CfnOutput(
            self,
            "ProcessPaymentFunctionArnOutput",
            value=self.process_payment_fn.function_arn,
            export_name="ProcessPaymentFunctionArn",
            description="Process Payment Lambda ARN for Step Functions",
        )
        
        CfnOutput(
            self,
            "AllocateShippingFunctionArnOutput",
            value=self.allocate_shipping_fn.function_arn,
            export_name="AllocateShippingFunctionArn",
            description="Allocate Shipping Lambda ARN for Step Functions",
        )
        
        CfnOutput(
            self,
            "SendNotificationFunctionArnOutput",
            value=self.send_notification_fn.function_arn,
            export_name="SendNotificationFunctionArn",
            description="Send Notification Lambda ARN for Step Functions",
        )
        
        CfnOutput(
            self,
            "CompensationHandlerFunctionArnOutput",
            value=self.compensation_handler_fn.function_arn,
            export_name="CompensationHandlerFunctionArn",
            description="Compensation Handler Lambda ARN for Step Functions",
        )