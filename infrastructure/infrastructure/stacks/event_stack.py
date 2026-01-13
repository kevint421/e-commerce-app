from aws_cdk import (
    Stack,
    Duration,
    aws_events as events,
    aws_events_targets as targets,
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
    - EventBridge rules for routing
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Custom EventBridge Event Bus
        self.event_bus = events.EventBus(
            self,
            "EcommerceEventBus",
            event_bus_name="ecommerce-events",
        )

        # DLQ
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
            visibility_timeout=Duration.seconds(90),  # Match Lambda timeout
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=inventory_dlq,
            ),
        )

        self.payment_queue = sqs.Queue(
            self,
            "PaymentQueue",
            queue_name="payment-queue",
            visibility_timeout=Duration.seconds(60),  # Match Lambda timeout
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=payment_dlq,
            ),
        )

        self.shipping_queue = sqs.Queue(
            self,
            "ShippingQueue",
            queue_name="shipping-queue",
            visibility_timeout=Duration.seconds(60),  # Match Lambda timeout
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=shipping_dlq,
            ),
        )

        self.notification_queue = sqs.Queue(
            self,
            "NotificationQueue",
            queue_name="notification-queue",
            visibility_timeout=Duration.seconds(60),  # Match Lambda timeout
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

        # ===== EventBridge Rules (must be in same stack as queues) =====

        # Rule 1: OrderCreated → inventory-queue
        order_created_rule = events.Rule(
            self,
            "OrderCreatedRule",
            event_bus=self.event_bus,
            event_pattern=events.EventPattern(
                source=["ecommerce.orders"],
                detail_type=["OrderCreated"],
            ),
            description="Routes OrderCreated events to inventory queue",
        )
        order_created_rule.add_target(
            targets.SqsQueue(
                self.inventory_queue,
                message=events.RuleTargetInput.from_event_path("$"),
            )
        )

        # Rule 2: InventoryReserved → payment-queue
        inventory_reserved_rule = events.Rule(
            self,
            "InventoryReservedRule",
            event_bus=self.event_bus,
            event_pattern=events.EventPattern(
                source=["ecommerce.inventory"],
                detail_type=["InventoryReserved"],
            ),
            description="Routes InventoryReserved events to payment queue",
        )
        inventory_reserved_rule.add_target(
            targets.SqsQueue(
                self.payment_queue,
                message=events.RuleTargetInput.from_event_path("$"),
            )
        )

        # Rule 3: PaymentConfirmed → shipping-queue
        payment_confirmed_rule = events.Rule(
            self,
            "PaymentConfirmedRule",
            event_bus=self.event_bus,
            event_pattern=events.EventPattern(
                source=["ecommerce.payments"],
                detail_type=["PaymentConfirmed"],
            ),
            description="Routes PaymentConfirmed events to shipping queue",
        )
        payment_confirmed_rule.add_target(
            targets.SqsQueue(
                self.shipping_queue,
                message=events.RuleTargetInput.from_event_path("$"),
            )
        )

        # Rule 4: All Events → notification-queue (fan-out)
        all_events_rule = events.Rule(
            self,
            "AllEventsRule",
            event_bus=self.event_bus,
            event_pattern=events.EventPattern(
                source=[
                    "ecommerce.orders",
                    "ecommerce.inventory",
                    "ecommerce.payments",
                    "ecommerce.shipping",
                ],
            ),
            description="Routes all ecommerce events to notification queue (fan-out)",
        )
        all_events_rule.add_target(
            targets.SqsQueue(
                self.notification_queue,
                message=events.RuleTargetInput.from_event_path("$"),
            )
        )

        # Store DLQs for monitoring
        self.dlq_queues = {
            "inventory": inventory_dlq,
            "payment": payment_dlq,
            "shipping": shipping_dlq,
            "notification": notification_dlq,
        }