# Microservices Saga Pattern Implementation

This project demonstrates a robust implementation of the Saga Pattern in a microservices architecture to ensure data consistency across distributed services without using two-phase commits. The implementation uses event-driven architecture with Apache Kafka as the message broker.

## Table of Contents
- [Microservices Saga Pattern Implementation](#microservices-saga-pattern-implementation)
  - [Table of Contents](#table-of-contents)
  - [Architecture Overview](#architecture-overview)
  - [What is the Saga Pattern?](#what-is-the-saga-pattern)
  - [Project Structure](#project-structure)
  - [Services](#services)
    - [Order Service (Orchestrator)](#order-service-orchestrator)
    - [Inventory Service](#inventory-service)
    - [Payment Service](#payment-service)
    - [Shipping Service](#shipping-service)
  - [Detailed Flow](#detailed-flow)
  - [Compensation Mechanisms](#compensation-mechanisms)
  - [Kafka Topics](#kafka-topics)
  - [Technology Stack](#technology-stack)
  - [Setup and Deployment](#setup-and-deployment)
    - [Prerequisites](#prerequisites)
    - [Running with Docker Compose](#running-with-docker-compose)
    - [Running Services Individually](#running-services-individually)
  - [Testing and Demonstration](#testing-and-demonstration)
    - [Creating a Test Order](#creating-a-test-order)
    - [Monitoring Events](#monitoring-events)
  - [Visualization Web App](#visualization-web-app)
    - [Using the Visualization App](#using-the-visualization-app)
  - [Educational Resources](#educational-resources)

## Architecture Overview

The system demonstrates a typical e-commerce flow involving order processing across multiple services:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  Order Service  │────▶│Inventory Service│────▶│ Payment Service │────▶│ Shipping Service│
│  (Orchestrator) │     │                 │     │                 │     │                 │
│                 │◀────│                 │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │                       │
        │                       │                       │                       │
        ▼                       ▼                       ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                                   Kafka Event Bus                                    │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## What is the Saga Pattern?

The Saga Pattern is a design pattern for managing distributed transactions across multiple microservices without using two-phase commits. Each service performs its local transaction and publishes an event, which triggers the next service in the chain.

There are two main types of saga implementations:
1. **Choreography**: Services communicate through events without a central coordinator
2. **Orchestration**: A central service (orchestrator) manages the transaction flow

This project implements the **Orchestration** approach, with the Order Service acting as the orchestrator.

## Project Structure

```
saga/
├── db/                      # Shared database utilities and migrations
├── inventory-service/       # Manages product inventory
├── order-service/           # Handles order creation and orchestrates the saga
├── payment-service/         # Processes payments for orders
├── shipping-service/        # Manages shipping and delivery
├── saga-webapp/             # Visualization interface for the saga pattern
└── docker-compose.yml       # Defines all services and infrastructure
```

## Services

### Order Service (Orchestrator)
- Creates new orders and initiates the saga process
- Tracks order status throughout the transaction
- Handles responses from other services
- Triggers compensation transactions when failures occur
- Maintains the order database

### Inventory Service
- Checks product availability
- Reserves inventory when an order is created
- Releases inventory when an order is cancelled or fails
- Maintains the product and inventory database

### Payment Service
- Processes payments for orders
- Issues refunds when orders fail after payment
- Maintains payment transaction records

### Shipping Service
- Arranges shipping for fulfilled orders
- Cancels shipping arrangements if needed
- Generates shipping IDs and tracking information

## Detailed Flow

The saga flow for processing an order follows these steps:

1. **Order Creation**:
   - User creates an order through the Order Service
   - Order Service stores the order with status "PENDING"
   - Order Service publishes an "order-created" event to Kafka

2. **Inventory Reservation**:
   - Inventory Service consumes the "order-created" event
   - Checks if all requested items are available in sufficient quantity
   - If available, reserves the inventory and publishes "inventory-reserved" event
   - Sends "inventory-response" event to Order Service (success or failure)
   - On success, Order Service updates order status to "INVENTORY_RESERVED"

3. **Payment Processing**:
   - Payment Service consumes the "inventory-reserved" event
   - Processes the payment for the order
   - Publishes "payment-completed" event on success
   - Sends "payment-response" event to Order Service (success or failure)
   - On success, Order Service updates order status to "PAYMENT_COMPLETED"

4. **Shipping Arrangement**:
   - Shipping Service consumes the "payment-completed" event
   - Creates a shipping record with tracking information
   - Sends "shipping-response" event to Order Service (success or failure)
   - On success, Order Service updates order status to "COMPLETED" with shipping ID

## Compensation Mechanisms

If any step in the saga fails, the system initiates compensating transactions to maintain data consistency:

1. **Inventory Reservation Failure**:
   - Order Service marks the order as "FAILED"
   - No further steps are executed

2. **Payment Processing Failure**:
   - Order Service marks the order as "FAILED"
   - Order Service publishes "release-inventory" event
   - Inventory Service releases the previously reserved inventory

3. **Shipping Arrangement Failure**:
   - Order Service marks the order as "FAILED"
   - Order Service publishes "refund-payment" event
   - Payment Service processes a refund
   - Order Service publishes "release-inventory" event
   - Inventory Service releases the previously reserved inventory

Each service implements idempotent handlers to ensure that operations are not duplicated if events are processed multiple times.

## Kafka Topics

The system uses the following Kafka topics for communication:

- **order-created**: Published when a new order is created
- **inventory-reserved**: Published when inventory is successfully reserved
- **inventory-response**: Contains the result of inventory operations
- **payment-completed**: Published when payment is successful
- **payment-response**: Contains the result of payment operations
- **shipping-response**: Contains the result of shipping operations
- **release-inventory**: Triggers inventory release (compensation)
- **refund-payment**: Triggers payment refund (compensation)
- **cancel-shipping**: Triggers shipping cancellation (compensation)

## Technology Stack

- **Node.js**: Runtime for all microservices
- **Express**: Web framework for REST APIs
- **Kafka**: Event messaging system for inter-service communication
- **SQLite**: Lightweight database for each service
- **Docker & Docker Compose**: Containerization and orchestration
- **Swagger**: API documentation

## Setup and Deployment

### Prerequisites
- Docker and Docker Compose
- Node.js (v14+) for local development

### Running with Docker Compose

The easiest way to run the entire application stack:

```bash
# Clone the repository
git clone https://github.com/yourusername/saga.git
cd saga

# Start all services
docker-compose up
```

This will start:
- Zookeeper and Kafka for messaging
- All four microservices
- The visualization web app

### Running Services Individually

For development, you can run services individually:

```bash
# Install dependencies for all services
npm install

# Start each service in separate terminals
cd order-service && npm start
cd inventory-service && npm start
cd payment-service && npm start
cd shipping-service && npm start
cd saga-webapp && npm start
```

## Testing and Demonstration

### Creating a Test Order

You can create a test order with configurable failure scenarios:

```bash
curl -X POST http://localhost:3001/saga/test-order \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust123",
    "items": [
      {
        "productId": "prod-1",
        "quantity": 2,
        "price": 25.99
      }
    ],
    "failInventory": false,
    "failPayment": false,
    "failShipping": false
  }'
```

Set any of the `fail*` flags to `true` to simulate failures at different stages.

### Monitoring Events

To see all events that have been processed:

```bash
curl http://localhost:3001/saga/events
```

## Visualization Web App

The project includes a web application for visualizing the saga pattern:

- **URL**: http://localhost:3000
- **Features**:
  - Real-time visualization of events flowing between services
  - Interactive order creation form with failure simulation
  - Service status monitoring
  - Event log with filtering capabilities
  - Sequence diagram visualization of transaction flow

### Using the Visualization App

1. Open http://localhost:3000 in your browser
2. Create a new order using the form
3. Observe the saga flow in real-time
4. Experiment with different failure scenarios

For detailed information about the visualization app, see [WEBAPP-README.md](WEBAPP-README.md).

## Educational Resources

This project is designed for educational purposes to demonstrate:
- Distributed transaction management with the Saga Pattern
- Event-driven microservices architecture
- Compensation strategies for failure recovery
- Real-time visualization of distributed systems
