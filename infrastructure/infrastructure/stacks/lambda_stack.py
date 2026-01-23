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
    aws_events as events,
    aws_events_targets as targets,
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
        admin_sessions_table = database_stack.admin_sessions_table
        
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
            tracing=_lambda.Tracing.ACTIVE,  # Enable X-Ray tracing
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

        # ===== Admin Lambda Functions =====

        # POST /admin/auth - Admin Authentication
        # Credentials are stored in AWS Secrets Manager: ecommerce/admin/credentials
        self.admin_auth_fn = _lambda.Function(
            self,
            "AdminAuthFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/admin-auth/dist"),
            layers=[self.shared_layer],
            environment={
                **common_env,
                "ADMIN_SESSIONS_TABLE_NAME": admin_sessions_table.table_name,
            },
            timeout=Duration.seconds(10),
            memory_size=256,
            description="Admin: Simple authentication for admin dashboard",
        )

        # Grant access to admin credentials in Secrets Manager
        self.admin_auth_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["secretsmanager:GetSecretValue"],
                resources=[
                    f"arn:aws:secretsmanager:{self.region}:{self.account}:secret:ecommerce/admin/credentials-*"
                ]
            )
        )

        # Grant access to admin sessions table
        admin_sessions_table.grant_read_write_data(self.admin_auth_fn)

        # Lambda Authorizer - Admin Session Token Validation
        self.admin_authorizer_fn = _lambda.Function(
            self,
            "AdminAuthorizerFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/admin-authorizer/dist"),
            environment={
                "ADMIN_SESSIONS_TABLE_NAME": admin_sessions_table.table_name,
            },
            timeout=Duration.seconds(5),
            memory_size=256,
            description="Lambda Authorizer: Validates admin session tokens",
        )

        # Grant authorizer read access to sessions table
        admin_sessions_table.grant_read_data(self.admin_authorizer_fn)

        # GET /admin/orders - List All Orders (Admin)
        self.admin_list_orders_fn = _lambda.Function(
            self,
            "AdminListOrdersFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/admin-list-orders/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=512,
            description="Admin: Lists all orders with filtering and pagination",
        )

        # POST /admin/orders/{orderId}/cancel - Cancel Order (Admin)
        self.admin_cancel_order_fn = _lambda.Function(
            self,
            "AdminCancelOrderFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/admin-cancel-order/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=512,
            description="Admin: Cancels orders with refund and inventory release",
        )

        # Grant admin cancel order access to Stripe secrets for refunds
        self.admin_cancel_order_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["secretsmanager:GetSecretValue"],
                resources=[f"arn:aws:secretsmanager:{self.region}:{self.account}:secret:ecommerce/stripe/*"],
            )
        )

        # PUT /admin/inventory/{productId} - Update Inventory (Admin)
        self.admin_update_inventory_fn = _lambda.Function(
            self,
            "AdminUpdateInventoryFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/admin-update-inventory/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=512,
            description="Admin: Updates inventory levels (set/add/subtract operations)",
        )

        # GET /admin/analytics - Analytics Dashboard (Admin)
        self.admin_analytics_fn = _lambda.Function(
            self,
            "AdminAnalyticsFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/api/admin-analytics/dist"),
            layers=[self.shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=512,
            description="Admin: Provides comprehensive analytics and metrics",
        )

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
            environment={
                **common_env,
                "SES_FROM_EMAIL": "KET126@pitt.edu",
                "TEST_CUSTOMER_EMAIL": "kevintcolleges@gmail.com",
            },
            timeout=Duration.seconds(30),
            memory_size=256,
            description="Sends order confirmation notifications via SES (Step Functions task)",
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

        # ===== Scheduled Lambda Functions =====

        # Cleanup Abandoned Carts - Scheduled function to release inventory
        self.cleanup_abandoned_carts_fn = _lambda.Function(
            self,
            "CleanupAbandonedCartsFunction",
            runtime=_lambda.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=_lambda.Code.from_asset("../backend/functions/scheduled/cleanup-abandoned-carts/dist"),
            layers=[self.shared_layer],
            environment={
                **common_env,
                "ABANDONED_CART_TIMEOUT_MINUTES": "30",  # Configurable timeout
                "SEND_REMINDER_EMAILS": "false",  # Set to "true" to enable abandoned cart reminders
                "SES_FROM_EMAIL": "KET126@pitt.edu",
                "TEST_CUSTOMER_EMAIL": "kevintcolleges@gmail.com",
                "FRONTEND_URL": "https://d1fo7kayl20noe.cloudfront.net/",  # CloudFront frontend URL
            },
            timeout=Duration.minutes(5),  # Allow time to process many orders
            memory_size=512,
            description="Releases inventory for abandoned carts and sends reminder emails",
        )

        # Create EventBridge Rule to trigger cleanup every 10 minutes
        cleanup_rule = events.Rule(
            self,
            "CleanupAbandonedCartsSchedule",
            schedule=events.Schedule.rate(Duration.minutes(10)),
            description="Triggers abandoned cart cleanup every 10 minutes",
        )

        # Add Lambda as target of the rule
        cleanup_rule.add_target(targets.LambdaFunction(self.cleanup_abandoned_carts_fn))

        # ===== Grant Permissions =====

        # API Functions need read/write access to tables
        for fn in [self.create_order_fn, self.get_order_fn, self.list_products_fn, self.check_inventory_fn]:
            orders_table.grant_read_write_data(fn)
            products_table.grant_read_write_data(fn)
            inventory_table.grant_read_write_data(fn)
            idempotency_table.grant_read_write_data(fn)
            if event_bus:
                event_bus.grant_put_events_to(fn)

        # ===== Admin Lambda Permissions =====

        # Admin list orders - needs read access to orders
        orders_table.grant_read_data(self.admin_list_orders_fn)

        # Admin cancel order - needs read/write to orders and inventory
        orders_table.grant_read_write_data(self.admin_cancel_order_fn)
        inventory_table.grant_read_write_data(self.admin_cancel_order_fn)

        # Admin update inventory - needs read/write to inventory and products
        inventory_table.grant_read_write_data(self.admin_update_inventory_fn)
        products_table.grant_read_data(self.admin_update_inventory_fn)

        # Admin analytics - needs read access to all tables
        orders_table.grant_read_data(self.admin_analytics_fn)
        products_table.grant_read_data(self.admin_analytics_fn)
        inventory_table.grant_read_data(self.admin_analytics_fn)

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

        # Grant cleanup abandoned carts function access to DynamoDB
        orders_table.grant_read_write_data(self.cleanup_abandoned_carts_fn)
        inventory_table.grant_read_write_data(self.cleanup_abandoned_carts_fn)

        # Grant cleanup function permission to send emails via SES
        self.cleanup_abandoned_carts_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["ses:SendEmail", "ses:SendRawEmail"],
                resources=["*"],  # TODO: In production, scope this down to specific email addresses
            )
        )

        # Store references for other stacks
        self.api_functions = {
            "create_order": self.create_order_fn,
            "get_order": self.get_order_fn,
            "list_products": self.list_products_fn,
            "check_inventory": self.check_inventory_fn,
            "stripe_webhook": self.stripe_webhook_fn,
            "admin_auth": self.admin_auth_fn,
            "admin_authorizer": self.admin_authorizer_fn,
            "admin_list_orders": self.admin_list_orders_fn,
            "admin_cancel_order": self.admin_cancel_order_fn,
            "admin_update_inventory": self.admin_update_inventory_fn,
            "admin_analytics": self.admin_analytics_fn,
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

        # ===== Enable X-Ray Tracing on all Lambda functions =====
        self._enable_xray_tracing()

    def _enable_xray_tracing(self):
        """
        Enable AWS X-Ray active tracing on all Lambda functions.
        This provides distributed tracing for the entire order fulfillment flow.
        """
        lambda_functions = [
            self.create_order_fn,
            self.get_order_fn,
            self.list_products_fn,
            self.check_inventory_fn,
            self.stripe_webhook_fn,
            self.admin_auth_fn,
            self.admin_authorizer_fn,
            self.admin_list_orders_fn,
            self.admin_cancel_order_fn,
            self.admin_update_inventory_fn,
            self.admin_analytics_fn,
            self.reserve_inventory_fn,
            self.process_payment_fn,
            self.allocate_shipping_fn,
            self.send_notification_fn,
            self.compensation_handler_fn,
            self.cleanup_abandoned_carts_fn,
        ]

        for func in lambda_functions:
            # Add X-Ray SDK to the function's execution role
            func.add_to_role_policy(
                iam.PolicyStatement(
                    actions=[
                        "xray:PutTraceSegments",
                        "xray:PutTelemetryRecords",
                    ],
                    resources=["*"],
                )
            )