#!/bin/bash
# Build script for Lambda functions
# Compiles TypeScript to JavaScript and bundles with dependencies

set -e

echo "Building Lambda functions..."

# Install esbuild if not present
if ! command -v esbuild &> /dev/null; then
    echo "Installing esbuild..."
    npm install -g esbuild
fi

# Build shared layer first
echo "Building shared layer..."
cd backend/shared
npm install
npm run build
cd ../..

# Create Lambda Layer structure
echo "Creating Lambda Layer..."
rm -rf infrastructure/lambda-layer
mkdir -p infrastructure/lambda-layer/nodejs/node_modules/ecommerce-backend-shared
cp -r backend/shared/dist/* infrastructure/lambda-layer/nodejs/node_modules/ecommerce-backend-shared/
cp backend/shared/package.json infrastructure/lambda-layer/nodejs/node_modules/ecommerce-backend-shared/

cp -r backend/shared/node_modules/* infrastructure/lambda-layer/nodejs/node_modules/

# List of Lambda functions
declare -a functions=(
    "backend/functions/api/create-order"
    "backend/functions/api/get-order"
    "backend/functions/api/list-products"
    "backend/functions/api/check-inventory"
    "backend/functions/events/compensation-handler"
    "backend/functions/stepfunctions/reserve-inventory"
    "backend/functions/stepfunctions/process-payment"
    "backend/functions/stepfunctions/allocate-shipping"
    "backend/functions/stepfunctions/send-notification"
)

# Build each Lambda function
for func_path in "${functions[@]}"; do
    echo "Building $func_path..."
    
    # Create dist directory
    mkdir -p "$func_path/dist"
    
    # Bundle with esbuild
    esbuild "$func_path/index.ts" \
        --bundle \
        --platform=node \
        --target=node20 \
        --format=cjs \
        --outfile="$func_path/dist/index.js" \
        --external:@aws-sdk/* \
        --external:ecommerce-backend-shared
    
    echo "✓ Built $func_path"
done

echo ""
echo "✅ All Lambda functions built successfully!"
echo ""
echo "Lambda Layer: infrastructure/lambda-layer/"
echo "Lambda functions compiled to: backend/functions/**/dist/index.js"
echo ""
echo "Next step: Deploy with 'cdk deploy EcommerceLambdaStack'"