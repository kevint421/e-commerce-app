# Distributed E-Commerce Order Fulfillment System

An event-driven e-commerce order fulfillment system built with AWS serverless services.

## Architecture Overview

This system implements a distributed architecture using:
- **Saga Pattern** for distributed transactions
- **Competing Consumer Pattern** for scalability
- **Idempotency** for reliability

## Project Goals

This project was built to practice and demonstrate:
- Distributed workflow orchestration
- Asynchronous payment processing with Stripe
- Saga-based failure handling and compensation
- Idempotent backend design
- Cloud-native observability and infrastructure-as-code
- Demo-friendly deployment strategies with no real payments processed

## Tech Stack

### Frontend
- React with TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- React Query (server state)
- React Router (navigation)
- Zustand (client state)
- Axios (HTTP client)
- React Hook Form (forms)

### Backend
- AWS API Gateway (REST API)
- AWS Lambda (serverless compute)
- AWS Step Functions (saga orchestration)
- Amazon SNS (pub/sub notifications)
- Amazon DynamoDB (NoSQL database)
- Amazon SES (email delivery)
- Stripe API (payments, test mode)

### Infrastructure
- AWS CDK (Python)
- GitHub Actions (CI/CD)

## Project Structure

```
ecommerce-fulfillment/
├── infrastructure/          # AWS CDK infrastructure code
│   ├── stacks/
│   │   ├── database_stack.py
│   │   ├── api_stack.py
│   │   ├── event_stack.py
│   │   └── monitoring_stack.py
│   └── app.py
├── backend/
│   ├── functions/
│   │   ├── api/             # API Gateway Lambda functions
│   │   └── events/          # Event-driven Lambda functions
│   ├── layers/              # Lambda layers (shared code)
│   ├── shared/              # Shared utilities and models
│   └── tests/               # Backend tests
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── store/
│   └── public/
└── docs/                    # Documentation
```

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+
- AWS CLI configured
- AWS CDK CLI

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd ecommerce-fulfillment
```

2. Install infrastructure dependencies
```bash
cd infrastructure
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Install frontend dependencies
```bash
cd ../frontend
npm install
```

### Local Development

3. Start frontend development server
```bash
cd frontend
npm run dev
```

### Deployment

Deploy to AWS:
```bash
cd infrastructure
cdk deploy --all --profile <your-aws-profile>
```

## Monitoring

- CloudWatch Dashboards: Monitor order metrics, queue depths, error rates
- X-Ray: Distributed tracing
- CloudWatch Alarms: Alert on DLQ depth, errors, latency

## License

MIT
