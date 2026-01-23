#!/bin/bash

# Run All Tests Script
# Runs all test suites in the e-commerce application

set -e  # Exit on error

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  E-Commerce Test Suite Runner${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

# Track overall success
OVERALL_SUCCESS=true

# Function to run tests in a directory
run_tests() {
    local test_dir=$1
    local test_name=$2

    echo -e "${BOLD}Running ${test_name}...${NC}"
    echo "Location: ${test_dir}"
    echo ""

    if [ ! -d "$test_dir" ]; then
        echo -e "${RED}✗ Directory not found: ${test_dir}${NC}"
        OVERALL_SUCCESS=false
        return 1
    fi

    # Check if node_modules exists, if not run npm install
    if [ ! -d "$test_dir/node_modules" ]; then
        echo -e "${YELLOW}⚠ Installing dependencies...${NC}"
        cd "$test_dir"
        npm install
        cd - > /dev/null
    fi

    # Run tests
    cd "$test_dir"
    if npm test; then
        echo -e "${GREEN}✓ ${test_name} passed!${NC}"
        echo ""
    else
        echo -e "${RED}✗ ${test_name} failed!${NC}"
        echo ""
        OVERALL_SUCCESS=false
    fi
    cd - > /dev/null
}

# 1. Backend Shared Library Tests
run_tests "backend/shared" "Backend Shared Library Tests"

# 2. Create Order Lambda Tests
run_tests "backend/functions/api/create-order/tests" "Create Order Lambda Unit Tests"

# 3. Integration Tests (optional - requires deployed API)
if [ -d "tests" ]; then
    if [ -z "$API_URL" ]; then
        echo -e "${YELLOW}========================================${NC}"
        echo -e "${YELLOW}Integration Tests${NC}"
        echo -e "${YELLOW}========================================${NC}"
        echo -e "${YELLOW}Skipping integration tests - API_URL not set${NC}"
        echo ""
        echo "To run integration tests, set the API_URL environment variable:"
        echo "  export API_URL=https://your-api-gateway-url.amazonaws.com/prod/"
        echo "  ./run-all-tests.sh"
        echo ""
    else
        run_tests "tests" "Integration Tests"
    fi
fi

# Summary
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Test Summary${NC}"
echo -e "${BOLD}========================================${NC}"

if [ "$OVERALL_SUCCESS" = true ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
