const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const { Kafka } = require('kafkajs');
const axios = require('axios');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Enable CORS
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Service URLs (with environment variables for Docker compatibility)
const SERVICES = {
  order: process.env.ORDER_SERVICE_URL || 'http://localhost:3001',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3003',
  shipping: process.env.SHIPPING_SERVICE_URL || 'http://localhost:3004'
};

// Kafka configuration
const kafka = new Kafka({
  clientId: 'saga-webapp',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

// Create Kafka producer
const producer = kafka.producer();

// Create Kafka consumer
const consumer = kafka.consumer({ groupId: 'saga-webapp-group' });

// Initialize Kafka consumer
async function initKafka() {
  await producer.connect();
  await consumer.connect();
  
  // Subscribe to all the saga-related topics
  const topics = [
    'order-created', 
    'inventory-reserved', 
    'inventory-response', 
    'payment-completed', 
    'payment-response',
    'shipping-response', 
    'release-inventory', 
    'refund-payment', 
    'cancel-shipping',
    'order-cancelled',
    'payment-failed'
  ];
  
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  // Process incoming Kafka messages
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const value = JSON.parse(message.value.toString());
      console.log(`Received message from ${topic}:`, value);
      
      // Emit event to connected clients
      io.emit('saga-event', {
        topic,
        data: value,
        timestamp: new Date().toISOString()
      });
    },
  });
}

// Helper function to publish Kafka event
async function publishEvent(topic, message) {
  try {
    await producer.send({
      topic,
      messages: [
        { 
          key: String(message.orderId),
          value: JSON.stringify(message)
        }
      ]
    });
    console.log(`Published to ${topic}:`, message);
    return true;
  } catch (error) {
    console.error(`Error publishing to ${topic}:`, error);
    return false;
  }
}

// Connect socket.io for real-time communication
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Handle new order creation from webapp
  socket.on('create-order', async (orderData) => {
    try {
      console.log('Creating new order:', orderData);
      const response = await axios.post(`${SERVICES.order}/orders`, orderData);
      socket.emit('order-created', response.data);
    } catch (error) {
      console.error('Error creating order:', error.message);
      socket.emit('error', { message: error.message });
    }
  });
  
  // Handle test order creation with configurable failures
  socket.on('create-test-order', async (testData) => {
    try {
      console.log('------------ DEBUG START ------------');
      console.log('Received create-test-order event with data:', testData);
      
      // First check if order service is available
      try {
        console.log('Checking if order service is available...');
        const healthResponse = await axios.get(`${SERVICES.order}/health`, { timeout: 1000 });
        console.log('Order service health check response:', healthResponse.data);
      } catch (err) {
        // Order service is not available
        console.error('Order service health check failed:', err.message);
        socket.emit('error', { 
          message: 'Order service is not available. Make sure all services are running.'
        });
        return;
      }
      
      console.log('Creating test order with configurable failures:', testData);
      console.log(`Posting to ${SERVICES.order}/saga/test-order`);
      
      const response = await axios.post(`${SERVICES.order}/saga/test-order`, testData);
      console.log('Order service response:', response.data);
      
      socket.emit('order-created', response.data);
      console.log('Emitted order-created event to client');
      console.log('------------ DEBUG END ------------');
    } catch (error) {
      console.error('Full error creating test order:', error);
      console.error('Error creating test order (message only):', error.message);
      socket.emit('error', { message: `Error creating test order: ${error.message}` });
    }
  });
  
  // Handle getting all orders
  socket.on('get-orders', async () => {
    try {
      const response = await axios.get(`${SERVICES.order}/orders`);
      socket.emit('orders-list', response.data);
    } catch (error) {
      console.error('Error fetching orders:', error.message);
      socket.emit('error', { message: error.message });
    }
  });
  
  // Handle getting order details
  socket.on('get-order', async (orderId) => {
    try {
      const response = await axios.get(`${SERVICES.order}/orders/${orderId}`);
      socket.emit('order-details', response.data);
    } catch (error) {
      console.error(`Error fetching order ${orderId}:`, error.message);
      socket.emit('error', { 
        action: 'get-order',
        message: `Failed to retrieve order ${orderId}: ${error.message}` 
      });
    }
  });
  
  // Handle failing a payment
  socket.on('fail-payment', async (orderId) => {
    try {
      // First check if order exists
      const orderResponse = await axios.get(`${SERVICES.order}/orders/${orderId}`);
      const order = orderResponse.data.order;
      
      if (!order) {
        socket.emit('error', { 
          action: 'fail-payment',
          message: `Order ${orderId} not found` 
        });
        return;
      }
      
      // Check if order is in a state where payment can be failed
      if (order.status !== 'INVENTORY_RESERVED' && order.status !== 'PAYMENT_COMPLETED') {
        socket.emit('error', { 
          action: 'fail-payment',
          message: `Cannot fail payment for order in ${order.status} status` 
        });
        return;
      }
      
      // Publish payment failure event directly to Kafka
      const success = await publishEvent('payment-failed', {
        orderId,
        success: false,
        reason: 'Manual payment failure triggered from UI'
      });
      
      if (success) {
        socket.emit('action-success', {
          action: 'fail-payment',
          message: `Payment failure triggered for order ${orderId}`
        });
      } else {
        socket.emit('error', {
          action: 'fail-payment',
          message: `Failed to publish payment failure event`
        });
      }
    } catch (error) {
      console.error(`Error failing payment for order ${orderId}:`, error.message);
      socket.emit('error', { 
        action: 'fail-payment',
        message: `Failed to fail payment for order ${orderId}: ${error.message}` 
      });
    }
  });
  
  // Handle canceling an order
  socket.on('cancel-order', async (orderId) => {
    try {
      // Check if order exists
      const orderResponse = await axios.get(`${SERVICES.order}/orders/${orderId}`);
      const order = orderResponse.data.order;
      
      if (!order) {
        socket.emit('error', { 
          action: 'cancel-order',
          message: `Order ${orderId} not found` 
        });
        return;
      }
      
      // Don't allow canceling already completed or failed orders
      if (order.status === 'COMPLETED' || order.status === 'FAILED') {
        socket.emit('error', { 
          action: 'cancel-order',
          message: `Cannot cancel order in ${order.status} status` 
        });
        return;
      }
      
      // Publish order cancellation event directly to Kafka
      const success = await publishEvent('order-cancelled', {
        orderId,
        reason: 'Manual cancellation triggered from UI'
      });
      
      if (success) {
        socket.emit('action-success', {
          action: 'cancel-order',
          message: `Order cancellation triggered for order ${orderId}`
        });
      } else {
        socket.emit('error', {
          action: 'cancel-order',
          message: `Failed to publish order cancellation event`
        });
      }
    } catch (error) {
      console.error(`Error canceling order ${orderId}:`, error.message);
      socket.emit('error', { 
        action: 'cancel-order',
        message: `Failed to cancel order ${orderId}: ${error.message}` 
      });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// API routes
app.get('/services-status', async (req, res) => {
  try {
    // Determine if running in Docker environment
    const isDocker = process.env.DOCKER_ENV === 'true';
    
    const services = [
      { 
        name: 'Order Service',
        urls: [
          isDocker ? 'http://order-service:3001/health' : 'http://localhost:3001/health'
        ],
        port: 3001
      },
      { 
        name: 'Inventory Service', 
        urls: [
          isDocker ? 'http://inventory-service:3002/health' : 'http://localhost:3002/health'
        ],
        port: 3002 
      },
      { 
        name: 'Payment Service', 
        urls: [
          isDocker ? 'http://payment-service:3003/health' : 'http://localhost:3003/health'
        ],
        port: 3003 
      },
      { 
        name: 'Shipping Service', 
        urls: [
          isDocker ? 'http://shipping-service:3004/health' : 'http://localhost:3004/health'
        ],
        port: 3004 
      }
    ];
    
    const statuses = await Promise.all(
      services.map(async (service) => {
        try {
          // Try each URL in the service.urls array until one works
          for (const url of service.urls) {
            try {
              const response = await axios.get(url, { timeout: 1000 });
              return { 
                ...service, 
                status: 'UP',
                details: response.data || {}
              };
            } catch (err) {
              // Continue to try the next URL if available
              console.log(`Failed to reach ${url}: ${err.message}`);
            }
          }
          // If all URLs failed, return DOWN status
          return { ...service, status: 'DOWN' };
        } catch (error) {
          return { ...service, status: 'DOWN' };
        }
      })
    );
    
    res.json(statuses);
  } catch (error) {
    console.error('Error checking services status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    service: 'saga-webapp',
    timestamp: new Date().toISOString()
  });
});

// Proxy endpoint to get all orders
app.get('/api/orders', async (req, res) => {
  try {
    const response = await axios.get(`${SERVICES.order}/orders`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching orders' 
    });
  }
});

// Proxy endpoint to get a specific order
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const response = await axios.get(`${SERVICES.order}/orders/${req.params.orderId}`);
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching order ${req.params.orderId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching order' 
    });
  }
});

// Proxy endpoint to create a new order
app.post('/api/orders', async (req, res) => {
  try {
    const response = await axios.post(`${SERVICES.order}/orders`, req.body);
    res.status(201).json(response.data);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating order' 
    });
  }
});

// ---- EDUCATIONAL SAGA CONTROL ENDPOINTS ----

// Get saga configuration
app.get('/api/saga/config', async (req, res) => {
  try {
    const response = await axios.get(`${SERVICES.order}/saga/config`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching saga configuration:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching saga configuration' 
    });
  }
});

// Update saga configuration
app.post('/api/saga/config', async (req, res) => {
  try {
    const response = await axios.post(`${SERVICES.order}/saga/config`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error('Error updating saga configuration:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating saga configuration' 
    });
  }
});

// Get saga events
app.get('/api/saga/events', async (req, res) => {
  try {
    // Forward orderId parameter if provided
    const orderId = req.query.orderId;
    let url = `${SERVICES.order}/saga/events`;
    
    // Add orderId to query params if provided
    if (orderId) {
      url += `?orderId=${orderId}`;
    }
    
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching saga events:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching saga events' 
    });
  }
});

// Clear saga event history
app.post('/api/saga/clear-history', async (req, res) => {
  try {
    const response = await axios.post(`${SERVICES.order}/saga/clear-history`);
    res.json(response.data);
  } catch (error) {
    console.error('Error clearing saga event history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error clearing saga event history' 
    });
  }
});

// Educational endpoint to create test orders with configurable failures
app.post('/api/saga/test-order', async (req, res) => {
  try {
    console.log('------------ API TEST ORDER DEBUG START ------------');
    console.log('Received direct API test order request with data:', req.body);
    
    // First check if order service is available
    try {
      console.log('Checking if order service is available...');
      const healthResponse = await axios.get(`${SERVICES.order}/health`, { timeout: 1000 });
      console.log('Order service health check response:', healthResponse.data);
    } catch (err) {
      console.error('Order service health check failed:', err.message);
      return res.status(500).json({ 
        success: false, 
        message: 'Order service is not available. Make sure all services are running.'
      });
    }
    
    console.log(`Posting to ${SERVICES.order}/saga/test-order`);
    const response = await axios.post(`${SERVICES.order}/saga/test-order`, req.body);
    console.log('Order service response:', response.data);
    
    // Try to emit this via socket.io as well
    try {
      io.emit('order-created', response.data);
      console.log('Broadcasted order-created event via socket.io');
    } catch (socketErr) {
      console.error('Error broadcasting via socket.io:', socketErr);
    }
    
    console.log('------------ API TEST ORDER DEBUG END ------------');
    res.status(201).json(response.data);
  } catch (error) {
    console.error('Full error creating test order:', error);
    console.error('Error creating test order (message only):', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating test order: ' + error.message
    });
  }
});

// Service health endpoints
app.get('/api/health/all', async (req, res) => {
  try {
    const results = {};
    for (const [service, url] of Object.entries(SERVICES)) {
      try {
        const response = await axios.get(`${url}/health`, { timeout: 2000 });
        results[service] = response.data;
      } catch (error) {
        results[service] = { status: 'DOWN', error: error.message };
      }
    }
    
    res.json({
      success: true,
      services: results
    });
  } catch (error) {
    console.error('Error checking services health:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking services health' 
    });
  }
});

// Direct URL endpoint to create test orders without UI
app.get('/create-test-order', async (req, res) => {
  console.log('Direct URL test order endpoint called!');
  
  // Extract parameters from query string
  const failInventory = req.query.inventory === 'fail';
  const failPayment = req.query.payment === 'fail';
  const failShipping = req.query.shipping === 'fail';
  
  // Create a standard test order
  const testData = {
    customerId: 'test123',
    items: [{ productId: 'PROD-1', quantity: 1, price: 1200 }],
    failInventory,
    failPayment,
    failShipping
  };
  
  try {
    console.log('Creating test order with direct URL:', testData);
    const response = await axios.post(`${SERVICES.order}/saga/test-order`, testData);
    
    // Render a success page with the order ID and back link
    const html = `
      <html>
        <head>
          <title>Test Order Created</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body class="bg-light">
          <div class="container my-5">
            <div class="card">
              <div class="card-header bg-success text-white">
                <h3>Test Order Created Successfully!</h3>
              </div>
              <div class="card-body">
                <p class="lead">Order ID: <strong>${response.data.orderId}</strong></p>
                <p>Test Flags:</p>
                <ul>
                  <li>Fail Inventory: ${failInventory ? 'Yes' : 'No'}</li>
                  <li>Fail Payment: ${failPayment ? 'Yes' : 'No'}</li>
                  <li>Fail Shipping: ${failShipping ? 'Yes' : 'No'}</li>
                </ul>
                <a href="/" class="btn btn-primary mt-3">Back to Dashboard</a>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Error creating test order via direct URL:', error);
    
    // Render an error page
    const html = `
      <html>
        <head>
          <title>Test Order Error</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body class="bg-light">
          <div class="container my-5">
            <div class="card">
              <div class="card-header bg-danger text-white">
                <h3>Error Creating Test Order</h3>
              </div>
              <div class="card-body">
                <p class="lead">Error: ${error.message}</p>
                <a href="/" class="btn btn-primary mt-3">Back to Dashboard</a>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    
    res.status(500).send(html);
  }
});

// Default route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Saga WebApp running on http://localhost:${PORT}`);
  
  // Initialize Kafka
  try {
    await initKafka();
    console.log('Kafka producer and consumer initialized');
  } catch (error) {
    console.error('Failed to initialize Kafka:', error);
  }
}); 