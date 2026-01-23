# Distributed E-Commerce Order Fulfillment System

An event-driven e-commerce order fulfillment system built with AWS serverless architecture, React, and TypeScript. This project demonstrates distributed transaction patterns, saga-based orchestration, and real payment processing with Stripe integration.

## Overview

This system implements a complete e-commerce order fulfillment pipeline with distributed transaction management, payment processing, inventory management, and order tracking capabilities. Built entirely on AWS serverless services, it demonstrates modern cloud-native architecture patterns.

### Project Goals

This project was built to practice and demonstrate:
- **Distributed Workflow Orchestration** using AWS Step Functions
- **Saga Pattern** for distributed transactions with compensation logic
- **Asynchronous Payment Processing** with Stripe webhooks
- **Idempotent Design** to prevent duplicate operations
- **Multi-Warehouse Inventory Management** with optimistic locking
- **Cloud-Native Observability** with CloudWatch and X-Ray
- **Infrastructure as Code** with AWS CDK (Python)
- **Modern React Architecture** with TypeScript and React Query

## Architecture

### High-Level Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│   React     │─────▶│ API Gateway  │─────▶│  Lambda Funcs   │
│   Frontend  │◀─────│  (REST API)  │◀─────│  (TypeScript)   │
└─────────────┘      └──────────────┘      └─────────────────┘
                            │                        │
                            │                        ▼
                            │              ┌─────────────────┐
                            │              │ Step Functions  │
                            │              │  (Saga Pattern) │
                            │              └─────────────────┘
                            │                        │
                            ▼                        ▼
                     ┌──────────────┐      ┌─────────────────┐
                     │  DynamoDB    │      │  Stripe API     │
                     │  (NoSQL DB)  │      │  (Payments)     │
                     └──────────────┘      └─────────────────┘
```

### Key Patterns

- **Saga Pattern**: AWS Step Functions orchestrates multi-step workflows with automatic compensation on failures
- **Idempotency**: DynamoDB-backed idempotency keys prevent duplicate payments and operations
- **Optimistic Locking**: Version numbers in DynamoDB prevent inventory overselling
- **Event-Driven**: SNS/SES for notifications (SES sandbox), Stripe webhooks for async payment events
- **Repository Pattern**: Clean separation of data access layer from business logic

### Order Fulfillment Flow

```
1. Customer places order
   ↓
2. Create Order (API) → Returns Stripe client secret
   ↓
3. Customer completes payment (Stripe Elements)
   ↓
4. Stripe webhook triggers Step Functions
   ↓
5. Reserve Inventory (multi-warehouse with optimistic locking)
   ↓
6. Process Payment (confirm with Stripe)
   ↓
7. Allocate Shipping (generate tracking number)
   ↓
8. Send Notification (email customer)
   ↓
9. Order Complete ✓

   ✗ On any failure → Compensation Handler
     - Releases inventory
     - Processes Stripe refund
     - Updates order status
```

## Features

### Customer Features
- Shopping cart with persistent state (localStorage)
- Two-step checkout process (shipping → payment)
- Stripe payment integration
- Order confirmation with mock tracking information
- Real-time order status tracking (polls every 5 seconds)
- Responsive design

### Admin Features
- Secure admin authentication with JWT tokens
- Order management dashboard
- Analytics dashboard with order metrics
- Multi-warehouse inventory management
- Order cancellation with automatic refunds
- Real-time order status updates

### Backend Features
- **RESTful API** with 12 endpoints
- **Step Functions Saga** orchestration with 4 task states
- **Stripe Integration**: Payment intents, confirmations, refunds, webhooks
- **Multi-Warehouse Inventory**: Optimistic locking prevents overselling
- **Idempotency**: Duplicate payment protection
- **CloudWatch Monitoring**: Metrics, logs, dashboards, alarms
- **X-Ray Tracing**: Distributed request tracing
- **Automated Compensation**: Saga rollback on failures

## Tech Stack

### Frontend
| Category | Technology | Version |
|----------|------------|---------|
| Framework | React + TypeScript | 19.2.0 |
| Build Tool | Vite | 7.2.4 |
| Styling | TailwindCSS | 4.1.18 |
| State Management | Zustand (client), React Query (server) | 5.0.10, 5.90.16 |
| Routing | React Router DOM | 7.12.0 |
| HTTP Client | Axios | 1.13.2 |
| Payments | Stripe React & Stripe.js | 5.4.1, 8.6.1 |
| Forms | React Hook Form | 7.57.0 |
| Notifications | react-hot-toast | 2.6.0 |
| Icons | lucide-react | 0.562.0 |

### Backend
| Category | Technology |
|----------|------------|
| API | AWS API Gateway (REST) |
| Compute | AWS Lambda (Node.js 20) |
| Orchestration | AWS Step Functions |
| Database | Amazon DynamoDB |
| Notifications | Amazon SNS, SES |
| Payments | Stripe API (test mode) |
| Secrets | AWS Secrets Manager |
| Language | TypeScript 5.9.3 |
| Bundler | esbuild |

### Infrastructure & DevOps
| Category | Technology |
|----------|------------|
| IaC | AWS CDK 2.232.1 (Python) |
| Hosting | S3 + CloudFront |
| Monitoring | CloudWatch, X-Ray |
| CI/CD | GitHub Actions |
| Testing | Jest 29.7.0, ts-jest, Axios |

## Project Structure

```
e-commerce-app/
├── frontend/                      # React TypeScript application
│   ├── src/
│   │   ├── components/            # React components
│   │   │   ├── admin/             # Admin-specific components
│   │   │   ├── cart/              # Shopping cart UI
│   │   │   ├── checkout/          # Checkout flow
│   │   │   ├── common/            # Reusable components
│   │   │   ├── layout/            # Layout components
│   │   │   └── products/          # Product display
│   │   ├── pages/                 # 8 application pages
│   │   ├── api/                   # Axios API client
│   │   ├── contexts/              # React Context (Auth)
│   │   ├── store/                 # Zustand stores (cart)
│   │   ├── types/                 # TypeScript types
│   │   └── utils/                 # Utility functions
│   ├── dist/                      # Vite build output
│   └── vite.config.ts             # Build configuration
│
├── backend/                       # Serverless backend
│   ├── functions/                 # 16 Lambda functions
│   │   ├── api/                   # 12 API Gateway handlers
│   │   │   ├── create-order/
│   │   │   ├── get-order/
│   │   │   ├── list-products/
│   │   │   ├── check-inventory/
│   │   │   ├── stripe-webhook/
│   │   │   └── admin-*/          # 6 admin functions
│   │   ├── stepfunctions/         # 4 Step Functions tasks
│   │   │   ├── reserve-inventory/
│   │   │   ├── process-payment/
│   │   │   ├── allocate-shipping/
│   │   │   └── send-notification/
│   │   ├── events/                # Event handlers
│   │   │   └── compensation-handler/
│   │   └── scheduled/             # Cron jobs
│   │       └── cleanup-abandoned-carts/
│   ├── shared/                    # Shared TypeScript library
│   │   ├── src/
│   │   │   ├── repositories/      # Data access layer
│   │   │   ├── services/          # Business logic
│   │   │   ├── types/             # Domain models
│   │   │   └── utils/             # Utilities
│   │   └── tests/                 # Unit tests (44 tests)
│   └── tests/                     # Backend tests
│
├── infrastructure/                # AWS CDK (Python)
│   ├── infrastructure/stacks/     # 7 CDK stacks
│   │   ├── database_stack.py      # DynamoDB tables
│   │   ├── lambda_stack.py        # Lambda functions + layers
│   │   ├── api_gateway_stack.py   # REST API + routes
│   │   ├── stepfunctions_stack.py # Step Functions state machine
│   │   ├── monitoring_stack.py    # CloudWatch + alarms
│   │   ├── frontend_stack.py      # S3 + CloudFront
│   │   └── event_stack.py         # SNS + SQS
│   ├── lambda-layer/              # Lambda layer dependencies
│   ├── app.py                     # CDK app entry point
│   └── cdk.json                   # CDK configuration
│
├── tests/                         # Integration tests
│   ├── integration/
│   │   └── order-flow.test.ts     # E2E order flow tests
│   └── jest.config.js
│
├── .github/workflows/             # CI/CD pipelines
│   ├── ci.yml                     # Continuous Integration
│   └── cd.yml                     # Continuous Deployment
│
├── docs/                          # Documentation
│   └── PROJECT_STRUCTURE.md       # Detailed structure guide
│
├── build-lambdas.sh               # Lambda build script
├── run-all-tests.sh               # Test runner (56 tests)
├── DEPLOYMENT.md                  # Deployment guide
└── README.md                      # This file
```

## Getting Started

### Prerequisites

- **Node.js** 20+
- **Python** 3.12+ 
- **AWS CLI** configured with credentials
- **AWS CDK CLI** installed
- **Stripe Account** (test mode)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd e-commerce-app
   ```

2. **Install backend dependencies**
   ```bash
   # Install shared library dependencies
   cd backend/shared
   npm install
   cd ../..
   ```

3. **Install infrastructure dependencies**
   ```bash
   cd infrastructure
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cd ..
   ```

4. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

### Local Development

#### Frontend Development

```bash
cd frontend

# Start development server (runs on http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

#### Backend Development

```bash
# Build all Lambda functions
./build-lambdas.sh

# Run backend unit tests
cd backend/shared
npm test

# Run specific function tests
cd backend/functions/api/create-order/tests
npm test
```

### Environment Variables

Create `.env.local` in `frontend/` for local development:

```env
VITE_API_URL=http://localhost:3000/  # Or your deployed API URL
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Deployment

### Quick Deployment

**First-time deployment:**

1. **Bootstrap CDK** (one-time per account/region)
   ```bash
   cd infrastructure
   cdk bootstrap
   ```

2. **Set environment variables**
   ```bash
   export ADMIN_USERNAME="admin"
   export ADMIN_PASSWORD="your-secure-password"
   export STRIPE_SECRET_KEY="sk_test_..."
   export STRIPE_WEBHOOK_SECRET="whsec_..."
   ```

3. **Deploy backend infrastructure**
   ```bash
   ./build-lambdas.sh
   cdk deploy --all
   ```

4. **Build and deploy frontend**
   ```bash
   cd ../frontend
   VITE_API_URL="<your-api-url>" npm run build
   cd ../infrastructure
   cdk deploy EcommerceFrontendStack
   ```

### Automated Deployment with GitHub Actions

After initial setup, deployments are fully automated via GitHub Actions:

1. Set GitHub repository secrets
2. Push to `main` branch → triggers automatic deployment
3. Monitor deployment in GitHub Actions tab

### Deployment URLs

After successful deployment:
- **Frontend**: `https://d111111abcdef8.cloudfront.net` (CloudFront URL)
- **API**: `https://abc123.execute-api.us-east-2.amazonaws.com/prod/`
- **Admin Dashboard**: `https://<cloudfront-url>/admin/login`

## Testing

### Run All Tests

```bash
# Run all test suites (56 tests total)
./run-all-tests.sh

# Run with integration tests (requires deployed API)
API_URL=https://your-api-url.amazonaws.com/prod/ ./run-all-tests.sh
```

### Individual Test Suites

```bash
# Backend shared library tests (44 tests)
cd backend/shared
npm test

# Create-order Lambda tests (4 tests)
cd backend/functions/api/create-order/tests
npm test

# Integration tests (8 tests)
cd tests
API_URL=https://your-api-url.amazonaws.com/prod/ npm test
```

## API Documentation

### Public Endpoints

```
POST   /orders                    # Create new order
GET    /orders/{orderId}          # Get order status
GET    /products                  # List products
GET    /inventory/{productId}     # Check inventory availability
POST   /webhooks/stripe           # Stripe webhook handler
```

### Admin Endpoints (Protected)

```
POST   /admin/auth                       # Admin login
GET    /admin/orders                     # List all orders
POST   /admin/orders/{orderId}/cancel    # Cancel order with refund
PUT    /admin/inventory/{productId}      # Update inventory levels
GET    /admin/analytics                  # Order analytics dashboard
```

### Example API Calls

**Create Order:**
```bash
curl -X POST https://your-api-url/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer-123",
    "items": [
      {"productId": "prod-iphone-15", "quantity": 1}
    ],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "Pittsburgh",
      "state": "PA",
      "postalCode": "15213",
      "country": "US"
    }
  }'
```

**Get Order:**
```bash
curl https://your-api-url/orders/order-123
```

**List Products:**
```bash
curl https://your-api-url/products
```

### Response Examples

**Successful Order Creation:**
```json
{
  "orderId": "order-abc123",
  "customerId": "customer-123",
  "items": [...],
  "totalAmount": 99900,
  "status": "PENDING",
  "clientSecret": "pi_123_secret_456",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Order Status:**
```json
{
  "orderId": "order-abc123",
  "status": "SHIPPING_ALLOCATED",
  "paymentStatus": "succeeded",
  "trackingNumber": "1Z999AA10123456784",
  "carrier": "UPS",
  "estimatedDelivery": "2024-01-18"
}
```

## Monitoring

### CloudWatch Dashboard

Navigate to: **AWS Console** → **CloudWatch** → **Dashboards** → `EcommerceOrderFulfillment`

**Metrics:**
- Order creation rate (orders/minute)
- Average order processing time
- Step Functions execution status
- Lambda invocation counts and errors
- API Gateway latency and error rates
- DynamoDB read/write capacity

### CloudWatch Alarms

Configured alarms (sends notifications to `ALARM_EMAIL`):
- Step Functions execution failures
- Lambda errors (>5% error rate)
- API Gateway 5xx errors
- High API latency (>2000ms)
- DynamoDB throttling events

### X-Ray Distributed Tracing

View end-to-end request traces:
1. Navigate to **AWS X-Ray** console
2. View service map for request flow visualization
3. Analyze traces to identify performance bottlenecks
4. Filter by error status or latency

### Logs

Lambda logs are available in CloudWatch Logs:
```bash
# View logs for a specific function
aws logs tail /aws/lambda/EcommerceLambdaStack-CreateOrderFunction --follow

# Search logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/EcommerceLambdaStack-CreateOrderFunction \
  --filter-pattern "ERROR"
```

## Database Schema

### DynamoDB Tables

**1. Orders Table**
- **Primary Key**: `ORDER#{orderId}`
- **GSI**: `customerId-createdAt-index` (query customer orders)
- **Attributes**: customerId, items, totalAmount, status, paymentIntentId, trackingNumber, shippingAddress, createdAt, updatedAt

**2. Products Table**
- **Primary Key**: `PRODUCT#{productId}`
- **Attributes**: name, description, price, category, imageUrl, active

**3. Inventory Table**
- **Primary Key**: `WAREHOUSE#{warehouseId}#PRODUCT#{productId}`
- **Attributes**: quantity, reserved, version (for optimistic locking)
- **Optimistic Locking**: Version number prevents concurrent updates from overselling

**4. Idempotency Table**
- **Primary Key**: `idempotencyKey`
- **TTL**: Automatically expires after 24 hours
- **Purpose**: Prevents duplicate payment processing

### Order Status States

```
PENDING              → Order created, awaiting payment
INVENTORY_RESERVED   → Inventory allocated across warehouses
PAYMENT_PROCESSING   → Payment being processed by Stripe
PAYMENT_CONFIRMED    → Payment successful
SHIPPING_ALLOCATED   → Tracking number generated (final success state)
CANCELLED            → Order cancelled by admin or customer
FAILED               → Order processing failed
```

## Architecture Decisions

### Why Step Functions?
- **Visual Workflow**: See order flow in AWS Console
- **Built-in Retries**: Automatic retry logic with exponential backoff
- **Saga Pattern**: Native support for compensation on failures
- **Audit Trail**: Complete execution history for debugging

### Why DynamoDB?
- **Serverless**: No server management, automatic scaling
- **Single-Digit Latency**: Consistent performance at any scale
- **Optimistic Locking**: Version numbers prevent inventory overselling
- **Global Secondary Indexes**: Query orders by customer

### Why Stripe Webhooks?
- **Async Processing**: Don't block checkout waiting for Step Functions
- **Reliability**: Stripe retries failed webhooks automatically
- **Security**: Webhook signature verification prevents fraud
- **Event Sourcing**: Complete payment event history

## Roadmap

### Future Possible Enhancements
- Enhanced email notifications with SES templates
- Customer authentication with Amazon Cognito
- Advanced admin dashboard with real-time updates

## License

MIT License 

---

**Live Demo**: [https://d1fo7kayl20noe.cloudfront.net/](https://d1fo7kayl20noe.cloudfront.net/)

