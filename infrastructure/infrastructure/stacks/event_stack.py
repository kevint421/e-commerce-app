from aws_cdk import (
    Stack,
    Duration,
    aws_events as events,
    aws_sqs as sqs,
    aws_sns as sns,
    aws_sns_subscriptions as subscriptions,
)
from constructs import Construct


class EventStack(Stack):
    """
    EventStack defines the event-driven architecture components:
    - EventBridge custom event bus
    - SQS queues with Dead Letter Queues
    - SNS topics for notifications
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Custom EventBridge Event Bus
        self.event_bus = events.EventBus(
            self,
            "EcommerceEventBus",
            event_bus_name="ecommerce-events",
        )

        # Dead Letter Queues (DLQs)
        inventory_dlq = sqs.Queue(
            self,
            "InventoryDLQ",
            queue_name="inventory-dlq",
            retention_period=Duration.days(14),
        )

        payment_dlq = sqs.Queue(
            self,
            "PaymentDLQ",
            queue_name="payment-dlq",
            retention_period=Duration.days(14),
        )

        shipping_dlq = sqs.Queue(
            self,
            "ShippingDLQ",
            queue_name="shipping-dlq",
            retention_period=Duration.days(14),
        )

        notification_dlq = sqs.Queue(
            self,
            "NotificationDLQ",
            queue_name="notification-dlq",
            retention_period=Duration.days(14),
        )

        # Main Processing Queues
        self.inventory_queue = sqs.Queue(
            self,
            "InventoryQueue",
            queue_name="inventory-queue",
            visibility_timeout=Duration.seconds(30),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=inventory_dlq,
            ),
        )

        self.payment_queue = sqs.Queue(
            self,
            "PaymentQueue",
            queue_name="payment-queue",
            visibility_timeout=Duration.seconds(30),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=payment_dlq,
            ),
        )

        self.shipping_queue = sqs.Queue(
            self,
            "ShippingQueue",
            queue_name="shipping-queue",
            visibility_timeout=Duration.seconds(30),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=shipping_dlq,
            ),
        )

        self.notification_queue = sqs.Queue(
            self,
            "NotificationQueue",
            queue_name="notification-queue",
            visibility_timeout=Duration.seconds(30),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=notification_dlq,
            ),
        )

        # SNS Topic for Order Notifications
        self.order_notifications_topic = sns.Topic(
            self,
            "OrderNotificationsTopic",
            topic_name="order-notifications",
            display_name="E-Commerce Order Notifications",
        )

        # Subscribe notification queue to SNS topic
        self.order_notifications_topic.add_subscription(
            subscriptions.SqsSubscription(self.notification_queue)
        )

        # Store DLQs for monitoring
        self.dlq_queues = {
            "inventory": inventory_dlq,
            "payment": payment_dlq,
            "shipping": shipping_dlq,
            "notification": notification_dlq,
        }
