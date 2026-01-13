from aws_cdk import (
    Stack,
    Duration,
    aws_stepfunctions as sfn,
    aws_stepfunctions_tasks as tasks,
    aws_lambda as _lambda,
    aws_iam as iam,
    CfnOutput,
)
from constructs import Construct


class EcommerceStepFunctionsStack(Stack):
    """
    Step Functions State Machine Stack
    Defines the order fulfillment saga orchestrator
    
    Uses CloudFormation exports to reference Lambda functions
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        # Import Lambda functions using CloudFormation exports
        # These are exported by LambdaStack
        from aws_cdk import Fn
        
        reserve_inventory_fn = _lambda.Function.from_function_arn(
            self,
            "ImportedReserveInventoryFn",
            Fn.import_value("ReserveInventoryFunctionArn"),
        )
        
        process_payment_fn = _lambda.Function.from_function_arn(
            self,
            "ImportedProcessPaymentFn",
            Fn.import_value("ProcessPaymentFunctionArn"),
        )
        
        allocate_shipping_fn = _lambda.Function.from_function_arn(
            self,
            "ImportedAllocateShippingFn",
            Fn.import_value("AllocateShippingFunctionArn"),
        )
        
        send_notification_fn = _lambda.Function.from_function_arn(
            self,
            "ImportedSendNotificationFn",
            Fn.import_value("SendNotificationFunctionArn"),
        )
        
        compensation_handler_fn = _lambda.Function.from_function_arn(
            self,
            "ImportedCompensationHandlerFn",
            Fn.import_value("CompensationHandlerFunctionArn"),
        )

        # ===== Define Task States =====

        # Task 1: Reserve Inventory
        reserve_inventory_task = tasks.LambdaInvoke(
            self,
            "ReserveInventoryTask",
            lambda_function=reserve_inventory_fn,
            payload=sfn.TaskInput.from_object(
                {
                    "orderId": sfn.JsonPath.string_at("$.orderId"),
                }
            ),
            result_path="$.reservationResult",
            retry_on_service_exceptions=False,
        )

        # Task 2: Process Payment
        process_payment_task = tasks.LambdaInvoke(
            self,
            "ProcessPaymentTask",
            lambda_function=process_payment_fn,
            payload=sfn.TaskInput.from_object(
                {
                    "orderId": sfn.JsonPath.string_at("$.orderId"),
                    "reservedItems": sfn.JsonPath.string_at(
                        "$.reservationResult.Payload.reservedItems"
                    ),
                }
            ),
            result_path="$.paymentResult",
            retry_on_service_exceptions=False,
        )

        # Task 3: Allocate Shipping
        allocate_shipping_task = tasks.LambdaInvoke(
            self,
            "AllocateShippingTask",
            lambda_function=allocate_shipping_fn,
            payload=sfn.TaskInput.from_object(
                {
                    "orderId": sfn.JsonPath.string_at("$.orderId"),
                    "paymentId": sfn.JsonPath.string_at(
                        "$.paymentResult.Payload.paymentId"
                    ),
                    "amount": sfn.JsonPath.string_at("$.paymentResult.Payload.amount"),
                }
            ),
            result_path="$.shippingResult",
            retry_on_service_exceptions=False,
        )

        # Task 4: Send Notification
        send_notification_task = tasks.LambdaInvoke(
            self,
            "SendNotificationTask",
            lambda_function=send_notification_fn,
            payload=sfn.TaskInput.from_object(
                {
                    "orderId": sfn.JsonPath.string_at("$.orderId"),
                    "trackingNumber": sfn.JsonPath.string_at(
                        "$.shippingResult.Payload.trackingNumber"
                    ),
                    "carrier": sfn.JsonPath.string_at(
                        "$.shippingResult.Payload.carrier"
                    ),
                    "estimatedDelivery": sfn.JsonPath.string_at(
                        "$.shippingResult.Payload.estimatedDelivery"
                    ),
                }
            ),
            result_path="$.notificationResult",
            retry_on_service_exceptions=False,
        )

        # Compensation Task: Rollback on failure
        compensate_task = tasks.LambdaInvoke(
            self,
            "CompensateTask",
            lambda_function=compensation_handler_fn,
            payload=sfn.TaskInput.from_object(
                {
                    "orderId": sfn.JsonPath.string_at("$.orderId"),
                    "failedStep": sfn.JsonPath.string_at("$.failedStep"),
                    "error": sfn.JsonPath.string_at("$.error"),
                }
            ),
            result_path="$.compensationResult",
            retry_on_service_exceptions=False,
        )

        # Success State
        success_state = sfn.Succeed(
            self,
            "OrderFulfillmentComplete",
            comment="Order fulfilled successfully",
        )

        # Failure State
        failure_state = sfn.Fail(
            self,
            "OrderFulfillmentFailed",
            cause="Order fulfillment failed",
            error="WorkflowFailed",
        )

        # ===== Define Error Handling =====

        # Define failure pass states first
        set_inventory_failure = sfn.Pass(
            self,
            "SetInventoryFailure",
            parameters={
                "orderId.$": "$.orderId",
                "failedStep": "INVENTORY",
                "error.$": "$.errorInfo.Cause",
            },
        )

        set_payment_failure = sfn.Pass(
            self,
            "SetPaymentFailure",
            parameters={
                "orderId.$": "$.orderId",
                "failedStep": "PAYMENT",
                "error.$": "$.errorInfo.Cause",
            },
        )

        set_shipping_failure = sfn.Pass(
            self,
            "SetShippingFailure",
            parameters={
                "orderId.$": "$.orderId",
                "failedStep": "SHIPPING",
                "error.$": "$.errorInfo.Cause",
            },
        )

        # Connect failure states to compensation
        set_inventory_failure.next(compensate_task)
        set_payment_failure.next(compensate_task)
        set_shipping_failure.next(compensate_task)

        # Add error catchers
        reserve_inventory_task.add_catch(
            set_inventory_failure,
            errors=["States.ALL"],
            result_path="$.errorInfo",
        )

        process_payment_task.add_catch(
            set_payment_failure,
            errors=["States.ALL"],
            result_path="$.errorInfo",
        )

        allocate_shipping_task.add_catch(
            set_shipping_failure,
            errors=["States.ALL"],
            result_path="$.errorInfo",
        )

        # ===== Define Workflow =====

        # Chain: Reserve → Pay → Ship → Notify → Success
        workflow_definition = (
            reserve_inventory_task.next(process_payment_task)
            .next(allocate_shipping_task)
            .next(send_notification_task)
            .next(success_state)
        )

        # Compensation flows to failure
        compensate_task.next(failure_state)

        # ===== Create State Machine =====

        self.state_machine = sfn.StateMachine(
            self,
            "OrderFulfillmentSaga",
            state_machine_name="OrderFulfillmentSaga",
            definition_body=sfn.DefinitionBody.from_chainable(workflow_definition),
            timeout=Duration.minutes(5),
            comment="Order Fulfillment Saga - Reserve → Pay → Ship → Notify",
        )

        # ===== Outputs =====

        CfnOutput(
            self,
            "StateMachineArn",
            value=self.state_machine.state_machine_arn,
            description="Order Fulfillment State Machine ARN",
            export_name="OrderFulfillmentStateMachineArn",
        )

        CfnOutput(
            self,
            "StateMachineName",
            value=self.state_machine.state_machine_name,
            description="Order Fulfillment State Machine Name",
        )
        
        # Store state machine for reference
        self.state_machine_arn = self.state_machine.state_machine_arn