"""
API Gateway Stack - Creates REST API with Lambda integrations
"""

from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_apigateway as apigw,
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
                # Logging disabled - requires CloudWatch role setup at account level
                # To enable: Set up CloudWatch role in API Gateway account settings first
                throttling_rate_limit=100,  # Requests per second
                throttling_burst_limit=200,  # Burst capacity
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,  # TODO: In production, specify your domain
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