# Saga Pattern Visualization Web App

This web application provides a visual interface to interact with and observe the Saga pattern in action with the microservices architecture.

## Features

- Create new orders and see the Saga pattern workflow in real-time
- Visualize message flows between microservices
- Monitor the status of all services
- View event logs for debugging and understanding the process
- Observe compensation actions when failures occur

## Prerequisites

- Node.js (v14+)
- Docker and Docker Compose

## Running Locally (Without Docker)

1. Install dependencies:
   ```
   npm install
   ```

2. Start the app:
   ```
   npm start
   ```

3. Access the web interface at http://localhost:3000

## Running with Docker Compose

The webapp is included in the main docker-compose.yml configuration. To run the entire system:

```bash
docker-compose up
```

This will start:
- Zookeeper
- Kafka
- Order Service
- Inventory Service
- Payment Service
- Shipping Service
- Saga Web App

Access the web interface at http://localhost:3000

## Usage Guide

1. **Check Services Status**
   - Make sure all services are "UP" before creating orders

2. **Create a New Order**
   - Fill in the "Create New Order" form
   - Add items with Product ID, Quantity, and Price
   - Click "Create Order" button

3. **Observe the Saga Flow**
   - Watch the visualization of messages flowing between services
   - Green events indicate successful operations
   - Red events indicate failures
   - Yellow events indicate compensation actions

## Technical Details

- Built with Express.js backend
- Uses Socket.IO for real-time updates
- Connects directly to Kafka to monitor all events
- Bootstrap 5 for frontend interface 