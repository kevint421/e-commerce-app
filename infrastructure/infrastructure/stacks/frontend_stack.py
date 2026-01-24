"""
Frontend Stack - S3 + CloudFront for React App
"""

from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    RemovalPolicy,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_s3_deployment as s3_deployment,
    aws_iam as iam,
)
from constructs import Construct
import os


class FrontendStack(Stack):
    """
    Frontend Stack

    Deploys React application to S3 with CloudFront CDN:
    - S3 bucket for static files (HTML, JS, CSS, images)
    - CloudFront distribution for global CDN
    - HTTPS enabled by default
    - Automatic cache invalidation on deployment
    - SPA routing support (404 → index.html)
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        api_url: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ===== S3 Bucket for Static Website =====
        self.website_bucket = s3.Bucket(
            self,
            "WebsiteBucket",
            bucket_name=None,  # Auto-generate unique name
            public_read_access=False,  # CloudFront will access via OAI
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,  # Delete bucket on stack deletion
            auto_delete_objects=True,  # Delete objects when bucket is deleted
            versioned=False,
            encryption=s3.BucketEncryption.S3_MANAGED,
        )

        # ===== CloudFront Origin Access Identity =====
        # Allows CloudFront to access S3 bucket without making it public
        origin_access_identity = cloudfront.OriginAccessIdentity(
            self,
            "WebsiteOAI",
            comment="OAI for frontend S3 bucket",
        )

        # Grant CloudFront read access to S3 bucket
        self.website_bucket.grant_read(origin_access_identity)

        # ===== CloudFront Distribution =====
        # Create S3 origin for CloudFront
        s3_origin = origins.S3Origin(
            self.website_bucket,
            origin_access_identity=origin_access_identity,
        )

        self.distribution = cloudfront.Distribution(
            self,
            "WebsiteDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=s3_origin,
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                compress=True,  # Enable gzip/brotli compression
            ),
            # Separate behavior for static assets (CSS, JS, images)
            # No error responses for assets - let them 404 naturally
            additional_behaviors={
                "/assets/*": cloudfront.BehaviorOptions(
                    origin=s3_origin,
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowed_methods=cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                    cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    compress=True,
                ),
                "/vite.svg": cloudfront.BehaviorOptions(
                    origin=s3_origin,
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowed_methods=cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                    cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    compress=True,
                ),
            },
            default_root_object="index.html",
            # SPA routing: serve index.html for 404s (client-side routing)
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(5),
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(5),
                ),
            ],
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,  # Use only North America & Europe edge locations (lower cost)
            comment="E-commerce frontend CloudFront distribution",
        )

        # ===== Deploy Frontend Files to S3 =====
        # Check if frontend build directory exists
        # Path is relative to infrastructure/infrastructure/stacks/ -> need to go up 3 levels
        frontend_build_path = os.path.join(
            os.path.dirname(__file__),  # stacks/
            "../../../frontend/dist"     # up 3 levels, then into frontend/dist
        )
        frontend_build_path = os.path.abspath(frontend_build_path)

        # Only deploy if build directory exists (prevents CDK synth errors)
        if os.path.exists(frontend_build_path):
            s3_deployment.BucketDeployment(
                self,
                "DeployWebsite",
                sources=[s3_deployment.Source.asset(frontend_build_path)],
                destination_bucket=self.website_bucket,
                distribution=self.distribution,
                distribution_paths=["/*"],  # Invalidate all CloudFront cache on deployment
                memory_limit=512,  # MB for the deployment Lambda
                prune=True,  # Remove old files from S3
            )

        # ===== Outputs =====
        CfnOutput(
            self,
            "WebsiteBucketName",
            value=self.website_bucket.bucket_name,
            description="S3 bucket name for frontend",
            export_name="EcommerceFrontendBucket",
        )

        CfnOutput(
            self,
            "CloudFrontURL",
            value=f"https://{self.distribution.distribution_domain_name}",
            description="CloudFront URL for frontend",
            export_name="EcommerceFrontendUrl",
        )

        CfnOutput(
            self,
            "CloudFrontDistributionId",
            value=self.distribution.distribution_id,
            description="CloudFront Distribution ID",
            export_name="EcommerceCloudFrontDistributionId",
        )

        CfnOutput(
            self,
            "ApiUrlForFrontend",
            value=api_url,
            description="API Gateway URL to configure in frontend",
        )
