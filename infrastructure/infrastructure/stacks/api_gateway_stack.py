"""
API Gateway Stack - Creates REST API with Lambda integrations
"""

from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_apigateway as apigw,
    aws_lambda as _lambda,
)
from constructs import Construct


class ApiGatewayStack(Stack):
    """
    API Gateway Stack

    Creates a REST API with the following endpoints:
    - POST /orders - Create order
    - GET /orders/{orderId} - Get order
    - GET /products - List products
    - GET /inventory/{productId} - Check inventory
    - POST /webhooks/stripe - Stripe webhook handler

    Admin endpoints:
    - GET /admin/orders - List all orders with filtering
    - POST /admin/orders/{orderId}/cancel - Cancel order with refund
    - PUT /admin/inventory/{productId} - Update inventory levels
    - GET /admin/analytics - Analytics and metrics dashboard
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        lambda_stack,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Get Lambda functions from Lambda stack
        api_functions = lambda_stack.api_functions

        # Create REST API
        self.api = apigw.RestApi(
            self,
            "EcommerceApi",
            rest_api_name="Ecommerce Order Fulfillment API",
            description="API for e-commerce order fulfillment system",
            deploy_options=apigw.StageOptions(
                stage_name="prod",
                # Enable X-Ray tracing for distributed tracing
                tracing_enabled=True,
                # Logging disabled - requires CloudWatch role setup at account level
                # To enable: Set up CloudWatch role in API Gateway account settings first
                throttling_rate_limit=100,  # Requests per second
                throttling_burst_limit=200,  # Burst capacity
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=["https://d1fo7kayl20noe.cloudfront.net"],  # CloudFront frontend URL
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=[
                    "Content-Type",
                    "X-Amz-Date",
                    "Authorization",
                    "X-Api-Key",
                    "X-Amz-Security-Token",
                ],
                max_age=Duration.hours(1),
            ),
        )

        # ===== /orders Resource =====
        orders_resource = self.api.root.add_resource("orders")

        # POST /orders - Create Order
        create_order_integration = apigw.LambdaIntegration(
            api_functions["create_order"],
            proxy=True,
            integration_responses=[
                apigw.IntegrationResponse(
                    status_code="201",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": "'*'",
                    },
                ),
                apigw.IntegrationResponse(
                    status_code="400",
                    selection_pattern=".*Bad Request.*",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": "'*'",
                    },
                ),
                apigw.IntegrationResponse(
                    status_code="500",
                    selection_pattern=".*Internal Server Error.*",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": "'*'",
                    },
                ),
            ],
        )

        orders_resource.add_method(
            "POST",
            create_order_integration,
            method_responses=[
                apigw.MethodResponse(
                    status_code="201",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": True,
                    },
                ),
                apigw.MethodResponse(
                    status_code="400",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": True,
                    },
                ),
                apigw.MethodResponse(
                    status_code="500",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": True,
                    },
                ),
            ],
            request_validator=apigw.RequestValidator(
                self,
                "CreateOrderValidator",
                rest_api=self.api,
                validate_request_body=True,
                validate_request_parameters=False,
            ),
        )

        # GET /orders/{orderId} - Get Order
        order_id_resource = orders_resource.add_resource("{orderId}")
        
        get_order_integration = apigw.LambdaIntegration(
            api_functions["get_order"],
            proxy=True,
        )

        order_id_resource.add_method(
            "GET",
            get_order_integration,
        )

        # ===== /products Resource =====
        products_resource = self.api.root.add_resource("products")

        # GET /products - List Products
        list_products_integration = apigw.LambdaIntegration(
            api_functions["list_products"],
            proxy=True,
        )

        products_resource.add_method(
            "GET",
            list_products_integration,
        )

        # ===== /inventory Resource =====
        inventory_resource = self.api.root.add_resource("inventory")
        inventory_product_resource = inventory_resource.add_resource("{productId}")

        # GET /inventory/{productId} - Check Inventory
        check_inventory_integration = apigw.LambdaIntegration(
            api_functions["check_inventory"],
            proxy=True,
        )

        inventory_product_resource.add_method(
            "GET",
            check_inventory_integration,
        )

        # ===== /webhooks Resource =====
        webhooks_resource = self.api.root.add_resource("webhooks")
        stripe_webhook_resource = webhooks_resource.add_resource("stripe")

        # POST /webhooks/stripe - Stripe Webhook Handler
        stripe_webhook_integration = apigw.LambdaIntegration(
            api_functions["stripe_webhook"],
            proxy=True,
        )

        stripe_webhook_resource.add_method(
            "POST",
            stripe_webhook_integration,
        )

        # ===== Lambda Authorizer =====
        # Validates admin session tokens stored in DynamoDB

        # Import authorizer function by ARN to avoid circular dependency
        # (Lambda stack can't directly depend on API Gateway stack)
        authorizer_function = _lambda.Function.from_function_attributes(
            self,
            "ImportedAuthorizerFunction",
            function_arn=api_functions["admin_authorizer"].function_arn,
            same_environment=True,
        )

        admin_authorizer = apigw.TokenAuthorizer(
            self,
            "AdminAuthorizer",
            handler=authorizer_function,
            identity_source="method.request.header.Authorization",
            results_cache_ttl=Duration.minutes(5),  # Cache auth results for 5 minutes
            authorizer_name="AdminSessionAuthorizer",
        )

        # ===== /admin Resource =====
        admin_resource = self.api.root.add_resource("admin")

        # POST /admin/auth - Admin Authentication
        admin_auth_integration = apigw.LambdaIntegration(
            api_functions["admin_auth"],
            proxy=True,
        )

        admin_auth_resource = admin_resource.add_resource("auth")
        admin_auth_resource.add_method(
            "POST",
            admin_auth_integration,
        )

        # /admin/orders Resource
        admin_orders_resource = admin_resource.add_resource("orders")

        # GET /admin/orders - List All Orders (Admin)
        admin_list_orders_integration = apigw.LambdaIntegration(
            api_functions["admin_list_orders"],
            proxy=True,
        )

        admin_orders_resource.add_method(
            "GET",
            admin_list_orders_integration,
            authorizer=admin_authorizer,
            authorization_type=apigw.AuthorizationType.CUSTOM,
        )

        # /admin/orders/{orderId} Resource
        admin_order_id_resource = admin_orders_resource.add_resource("{orderId}")

        # /admin/orders/{orderId}/cancel Resource
        admin_cancel_order_resource = admin_order_id_resource.add_resource("cancel")

        # POST /admin/orders/{orderId}/cancel - Cancel Order (Admin)
        admin_cancel_order_integration = apigw.LambdaIntegration(
            api_functions["admin_cancel_order"],
            proxy=True,
        )

        admin_cancel_order_resource.add_method(
            "POST",
            admin_cancel_order_integration,
            authorizer=admin_authorizer,
            authorization_type=apigw.AuthorizationType.CUSTOM,
        )

        # /admin/inventory Resource
        admin_inventory_resource = admin_resource.add_resource("inventory")
        admin_inventory_product_resource = admin_inventory_resource.add_resource("{productId}")

        # PUT /admin/inventory/{productId} - Update Inventory (Admin)
        admin_update_inventory_integration = apigw.LambdaIntegration(
            api_functions["admin_update_inventory"],
            proxy=True,
        )

        admin_inventory_product_resource.add_method(
            "PUT",
            admin_update_inventory_integration,
            authorizer=admin_authorizer,
            authorization_type=apigw.AuthorizationType.CUSTOM,
        )

        # /admin/analytics Resource
        admin_analytics_resource = admin_resource.add_resource("analytics")

        # GET /admin/analytics - Analytics Dashboard (Admin)
        admin_analytics_integration = apigw.LambdaIntegration(
            api_functions["admin_analytics"],
            proxy=True,
        )

        admin_analytics_resource.add_method(
            "GET",
            admin_analytics_integration,
            authorizer=admin_authorizer,
            authorization_type=apigw.AuthorizationType.CUSTOM,
        )

        # ===== Gateway Responses - Add CORS headers to error responses =====
        # This ensures CORS headers are present even when authorizer denies requests

        # 401 Unauthorized (from authorizer)
        self.api.add_gateway_response(
            "Unauthorized",
            type=apigw.ResponseType.UNAUTHORIZED,
            response_headers={
                "Access-Control-Allow-Origin": "'https://d1fo7kayl20noe.cloudfront.net'",
                "Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
            },
        )

        # 403 Forbidden (from authorizer deny policy)
        self.api.add_gateway_response(
            "AccessDenied",
            type=apigw.ResponseType.ACCESS_DENIED,
            response_headers={
                "Access-Control-Allow-Origin": "'https://d1fo7kayl20noe.cloudfront.net'",
                "Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
            },
        )

        # 500 Internal Server Error
        self.api.add_gateway_response(
            "Default5XX",
            type=apigw.ResponseType.DEFAULT_5_XX,
            response_headers={
                "Access-Control-Allow-Origin": "'https://d1fo7kayl20noe.cloudfront.net'",
                "Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
            },
        )

        # 400 Bad Request
        self.api.add_gateway_response(
            "Default4XX",
            type=apigw.ResponseType.DEFAULT_4_XX,
            response_headers={
                "Access-Control-Allow-Origin": "'https://d1fo7kayl20noe.cloudfront.net'",
                "Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
            },
        )

        # ===== Outputs =====
        CfnOutput(
            self,
            "ApiUrl",
            value=self.api.url,
            description="API Gateway URL",
            export_name="EcommerceApiUrl",
        )

        CfnOutput(
            self,
            "ApiId",
            value=self.api.rest_api_id,
            description="API Gateway ID",
            export_name="EcommerceApiId",
        )

        # Output example curl commands
        CfnOutput(
            self,
            "CreateOrderExample",
            value=f'curl -X POST {self.api.url}orders -H "Content-Type: application/json" -d \'{{"customerId":"customer-123","items":[{{"productId":"prod-1","quantity":2}}],"shippingAddress":{{"street":"123 Main St","city":"SF","state":"CA","postalCode":"94102","country":"US"}}}}\'',
            description="Example: Create Order",
        )

        CfnOutput(
            self,
            "GetOrderExample",
            value=f'curl {self.api.url}orders/order-123',
            description="Example: Get Order",
        )

        CfnOutput(
            self,
            "ListProductsExample",
            value=f'curl {self.api.url}products',
            description="Example: List Products",
        )

        CfnOutput(
            self,
            "CheckInventoryExample",
            value=f'curl {self.api.url}inventory/prod-123',
            description="Example: Check Inventory",
        )