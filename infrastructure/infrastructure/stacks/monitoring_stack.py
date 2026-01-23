"""
Monitoring Stack - CloudWatch Dashboards, Alarms, and Observability
"""

from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_cloudwatch as cloudwatch,
    aws_cloudwatch_actions as cw_actions,
    aws_sns as sns,
    aws_sns_subscriptions as sns_subscriptions,
)
from constructs import Construct


class MonitoringStack(Stack):
    """
    Monitoring Stack

    Creates comprehensive monitoring and observability:
    - CloudWatch Dashboard with key metrics
    - CloudWatch Alarms for critical failures
    - SNS topic for alarm notifications
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        lambda_stack,
        api_gateway_stack,
        stepfunctions_stack,
        alarm_email: str = None,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Get resources from other stacks
        api_functions = lambda_stack.api_functions
        state_machine = stepfunctions_stack.state_machine
        api = api_gateway_stack.api

        # ===== SNS Topic for Alarms =====
        self.alarm_topic = sns.Topic(
            self,
            "AlarmTopic",
            display_name="E-Commerce System Alarms",
            topic_name="ecommerce-alarms",
        )

        # Subscribe email if provided
        if alarm_email:
            self.alarm_topic.add_subscription(
                sns_subscriptions.EmailSubscription(alarm_email)
            )

        # ===== CloudWatch Dashboard =====
        self.dashboard = cloudwatch.Dashboard(
            self,
            "EcommerceDashboard",
            dashboard_name="EcommerceOrderFulfillment",
        )

        # ----- API Gateway Metrics -----
        self.dashboard.add_widgets(
            cloudwatch.TextWidget(
                markdown="# API Gateway Metrics",
                width=24,
                height=1,
            )
        )

        # API Request Count and Latency
        self.dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="API Request Count",
                left=[
                    api.metric_count(period=Duration.minutes(5)),
                ],
                width=12,
                height=6,
            ),
            cloudwatch.GraphWidget(
                title="API Latency",
                left=[
                    api.metric_latency(period=Duration.minutes(5)),
                ],
                width=12,
                height=6,
            ),
        )

        # API Error Rates
        self.dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="API 4XX Errors",
                left=[
                    api.metric_client_error(period=Duration.minutes(5)),
                ],
                width=12,
                height=6,
            ),
            cloudwatch.GraphWidget(
                title="API 5XX Errors",
                left=[
                    api.metric_server_error(period=Duration.minutes(5)),
                ],
                width=12,
                height=6,
            ),
        )

        # ----- Step Functions Metrics -----
        self.dashboard.add_widgets(
            cloudwatch.TextWidget(
                markdown="# Step Functions - Order Fulfillment Saga",
                width=24,
                height=1,
            )
        )

        # Step Functions Executions
        self.dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="Saga Executions",
                left=[
                    state_machine.metric_started(period=Duration.minutes(5)),
                    state_machine.metric_succeeded(period=Duration.minutes(5)),
                    state_machine.metric_failed(period=Duration.minutes(5)),
                ],
                width=12,
                height=6,
            ),
            cloudwatch.GraphWidget(
                title="Saga Execution Time",
                left=[
                    state_machine.metric_time(period=Duration.minutes(5)),
                ],
                width=12,
                height=6,
            ),
        )

        # ----- Lambda Function Metrics -----
        self.dashboard.add_widgets(
            cloudwatch.TextWidget(
                markdown="# Lambda Function Metrics",
                width=24,
                height=1,
            )
        )

        # Key Lambda Functions Performance
        key_functions = [
            ("Create Order", api_functions["create_order"]),
            ("Stripe Webhook", api_functions["stripe_webhook"]),
            ("Reserve Inventory", lambda_stack.reserve_inventory_fn),
            ("Process Payment", lambda_stack.process_payment_fn),
        ]

        for i in range(0, len(key_functions), 2):
            widgets = []
            for j in range(2):
                if i + j < len(key_functions):
                    name, func = key_functions[i + j]
                    widgets.append(
                        cloudwatch.GraphWidget(
                            title=f"{name} - Invocations & Errors",
                            left=[
                                func.metric_invocations(period=Duration.minutes(5)),
                                func.metric_errors(period=Duration.minutes(5)),
                            ],
                            width=12,
                            height=6,
                        )
                    )
            self.dashboard.add_widgets(*widgets)

        # Lambda Duration
        self.dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="Lambda Duration (ms)",
                left=[
                    api_functions["create_order"].metric_duration(period=Duration.minutes(5)),
                    api_functions["stripe_webhook"].metric_duration(period=Duration.minutes(5)),
                    lambda_stack.reserve_inventory_fn.metric_duration(period=Duration.minutes(5)),
                ],
                width=24,
                height=6,
            )
        )

        # ----- Custom Metrics (if we add them) -----
        self.dashboard.add_widgets(
            cloudwatch.TextWidget(
                markdown="# Business Metrics",
                width=24,
                height=1,
            )
        )

        # Order success rate (calculated from Step Functions)
        self.dashboard.add_widgets(
            cloudwatch.SingleValueWidget(
                title="Order Success Rate",
                metrics=[
                    cloudwatch.MathExpression(
                        expression="(succeeded / started) * 100",
                        using_metrics={
                            "started": state_machine.metric_started(
                                statistic="Sum",
                                period=Duration.hours(1),
                            ),
                            "succeeded": state_machine.metric_succeeded(
                                statistic="Sum",
                                period=Duration.hours(1),
                            ),
                        },
                    )
                ],
                width=8,
                height=6,
            ),
            cloudwatch.SingleValueWidget(
                title="Failed Orders (1h)",
                metrics=[
                    state_machine.metric_failed(
                        statistic="Sum",
                        period=Duration.hours(1),
                    )
                ],
                width=8,
                height=6,
            ),
            cloudwatch.SingleValueWidget(
                title="Total API Requests (1h)",
                metrics=[
                    api.metric_count(
                        statistic="Sum",
                        period=Duration.hours(1),
                    )
                ],
                width=8,
                height=6,
            ),
        )

        # ===== CloudWatch Alarms =====

        # Alarm: Step Functions Failures
        self.step_functions_failure_alarm = cloudwatch.Alarm(
            self,
            "StepFunctionsFailureAlarm",
            metric=state_machine.metric_failed(
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=3,
            evaluation_periods=1,
            datapoints_to_alarm=1,
            alarm_name="Ecommerce-StepFunctions-Failures",
            alarm_description="Alert when Step Functions saga fails 3+ times in 5 minutes",
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        self.step_functions_failure_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )

        # Alarm: API Gateway 5XX Errors
        self.api_5xx_alarm = cloudwatch.Alarm(
            self,
            "API5XXAlarm",
            metric=api.metric_server_error(
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=10,
            evaluation_periods=1,
            datapoints_to_alarm=1,
            alarm_name="Ecommerce-API-5XX-Errors",
            alarm_description="Alert when API Gateway has 10+ 5XX errors in 5 minutes",
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        self.api_5xx_alarm.add_alarm_action(cw_actions.SnsAction(self.alarm_topic))

        # Alarm: Lambda Errors (Create Order)
        self.create_order_error_alarm = cloudwatch.Alarm(
            self,
            "CreateOrderErrorAlarm",
            metric=api_functions["create_order"].metric_errors(
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=5,
            evaluation_periods=1,
            datapoints_to_alarm=1,
            alarm_name="Ecommerce-CreateOrder-Errors",
            alarm_description="Alert when CreateOrder Lambda has 5+ errors in 5 minutes",
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        self.create_order_error_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )

        # Alarm: Lambda Throttles
        self.lambda_throttle_alarm = cloudwatch.Alarm(
            self,
            "LambdaThrottleAlarm",
            metric=api_functions["create_order"].metric_throttles(
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=5,
            evaluation_periods=1,
            datapoints_to_alarm=1,
            alarm_name="Ecommerce-Lambda-Throttles",
            alarm_description="Alert when Lambda functions are throttled 5+ times in 5 minutes",
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        self.lambda_throttle_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )

        # Alarm: High API Latency
        self.api_latency_alarm = cloudwatch.Alarm(
            self,
            "APILatencyAlarm",
            metric=api.metric_latency(
                statistic="Average",
                period=Duration.minutes(5),
            ),
            threshold=3000,  # 3 seconds
            evaluation_periods=2,
            datapoints_to_alarm=2,
            alarm_name="Ecommerce-API-High-Latency",
            alarm_description="Alert when API latency exceeds 3 seconds for 10 minutes",
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        self.api_latency_alarm.add_alarm_action(cw_actions.SnsAction(self.alarm_topic))

        # ===== Outputs =====
        CfnOutput(
            self,
            "DashboardURL",
            value=f"https://console.aws.amazon.com/cloudwatch/home?region={self.region}#dashboards:name={self.dashboard.dashboard_name}",
            description="CloudWatch Dashboard URL",
        )

        CfnOutput(
            self,
            "AlarmTopicArn",
            value=self.alarm_topic.topic_arn,
            description="SNS Topic ARN for alarm notifications",
        )
