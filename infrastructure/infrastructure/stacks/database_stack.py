from aws_cdk import (
    Stack,
    RemovalPolicy,
    aws_dynamodb as dynamodb,
)
from constructs import Construct


class DatabaseStack(Stack):
    """
    DatabaseStack defines all DynamoDB tables for the e-commerce system.
    
    Tables:
    - Orders: Main order data
    - Products: Product catalog
    - Inventory: Multi-warehouse inventory with optimistic locking
    - OrderEvents: Event sourcing table for order lifecycle
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Orders Table
        self.orders_table = dynamodb.Table(
            self,
            "OrdersTable",
            partition_key=dynamodb.Attribute(
                name="PK", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,  # Change to RETAIN for production
            point_in_time_recovery=True,
            stream=dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
        )

        # GSI for querying orders by customer
        self.orders_table.add_global_secondary_index(
            index_name="customerId-createdAt-index",
            partition_key=dynamodb.Attribute(
                name="customerId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # GSI for querying orders by status
        self.orders_table.add_global_secondary_index(
            index_name="status-createdAt-index",
            partition_key=dynamodb.Attribute(
                name="status", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # Products Table
        self.products_table = dynamodb.Table(
            self,
            "ProductsTable",
            partition_key=dynamodb.Attribute(
                name="PK", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
            point_in_time_recovery=True,
        )

        # GSI for querying products by category
        self.products_table.add_global_secondary_index(
            index_name="category-name-index",
            partition_key=dynamodb.Attribute(
                name="category", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="name", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # Inventory Table (with optimistic locking)
        self.inventory_table = dynamodb.Table(
            self,
            "InventoryTable",
            partition_key=dynamodb.Attribute(
                name="PK", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
            point_in_time_recovery=True,
        )

        # GSI for querying inventory by product across all warehouses
        self.inventory_table.add_global_secondary_index(
            index_name="productId-warehouseId-index",
            partition_key=dynamodb.Attribute(
                name="productId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="warehouseId", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # OrderEvents Table (Event Sourcing)
        self.order_events_table = dynamodb.Table(
            self,
            "OrderEventsTable",
            partition_key=dynamodb.Attribute(
                name="PK", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="SK", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
            point_in_time_recovery=True,
            stream=dynamodb.StreamViewType.NEW_IMAGE,
        )

        # Idempotency Table (for payment deduplication)
        self.idempotency_table = dynamodb.Table(
            self,
            "IdempotencyTable",
            partition_key=dynamodb.Attribute(
                name="idempotencyKey", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
            time_to_live_attribute="expiresAt",  # Auto-cleanup old keys
        )
