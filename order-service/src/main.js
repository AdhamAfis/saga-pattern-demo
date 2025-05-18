const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const { setupKafka, publishEvent, consumer } = require('./kafka/kafka');
const { db, initializeDatabase } = require('./db/init-db');

const app = express();
app.use(bodyParser.json());

// Serve Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// For educational purposes - saga configuration
global.sagaConfig = {
  enableLogging: true,
  recordEvents: true,
  eventHistory: []
};

// Educational endpoints for saga demonstration
app.get('/saga/config', (req, res) => {
  res.json({
    success: true,
    config: sagaConfig
  });
});

app.post('/saga/config', (req, res) => {
  const newConfig = req.body;
  
  if (newConfig) {
    // Only update specified fields
    if (newConfig.enableLogging !== undefined) sagaConfig.enableLogging = newConfig.enableLogging;
    if (newConfig.recordEvents !== undefined) sagaConfig.recordEvents = newConfig.recordEvents;
    
    res.json({
      success: true,
      message: 'Saga configuration updated',
      config: sagaConfig
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Invalid configuration data'
    });
  }
});

// Clear event history
app.post('/saga/clear-history', (req, res) => {
  sagaConfig.eventHistory = [];
  res.json({
    success: true,
    message: 'Saga event history cleared'
  });
});

// Get event history
app.get('/saga/events', (req, res) => {
  res.json({
    success: true,
    events: global.sagaConfig.eventHistory
  });
});

/**
 * @swagger
 * /saga/test-order:
 *   post:
 *     summary: Create a test order with configurable failures (for educational purposes)
 *     tags: [Saga Education]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerId:
 *                 type: string
 *               items:
 *                 type: array
 *               failInventory:
 *                 type: boolean
 *               failPayment:
 *                 type: boolean
 *               failShipping:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Test order created successfully
 */
app.post('/saga/test-order', async (req, res) => {
  try {
    const { customerId, items, failInventory, failPayment, failShipping } = req.body;
    
    if (!customerId || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Invalid order data' });
    }
    
    // Calculate total amount (simplified)
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Create a new order
    const orderId = uuidv4();
    const createdAt = new Date().toISOString();
    
    // Insert order into database
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO orders (orderId, customerId, totalAmount, status, createdAt, version) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, customerId, totalAmount, 'PENDING', createdAt, 1],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
    
    // Insert order items
    const orderItemsPromises = items.map(item => {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO order_items (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)',
          [orderId, item.productId, item.quantity, item.price],
          function(err) {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          }
        );
      });
    });
    
    await Promise.all(orderItemsPromises);
    
    // Publish event to start the saga - with test flags for educational purposes
    const published = await publishEvent('order-created', {
      orderId,
      customerId,
      items,
      totalAmount,
      testFlags: {
        failInventory: Boolean(failInventory),
        failPayment: Boolean(failPayment),
        failShipping: Boolean(failShipping)
      }
    });
    
    if (published) {
      res.status(201).json({
        success: true,
        orderId,
        message: 'Test order created successfully and processing has begun',
        testFlags: {
          failInventory: Boolean(failInventory),
          failPayment: Boolean(failPayment),
          failShipping: Boolean(failShipping)
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to initiate order processing'
      });
    }
  } catch (error) {
    console.error('Error creating test order:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

const PORT = process.env.SERVICE_PORT || 3001;

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    service: 'order-service',
    timestamp: new Date().toISOString()
  });
});

// Initialize Kafka
setupKafka().then(() => {
  console.log('Kafka setup complete for Order Service');

  // Listen for responses from other services
  consumer.run({
    eachMessage: async ({ topic, message }) => {
      const data = JSON.parse(message.value.toString());
      console.log(`Received message from ${topic}:`, data);
      
      // Record received events for educational purposes
      const { recordEvent } = require('./kafka/kafka');
      recordEvent('RECEIVE', topic, data);

      switch (topic) {
        case 'inventory-response':
          await handleInventoryResponse(data);
          break;
        case 'payment-response':
          await handlePaymentResponse(data);
          break;
        case 'shipping-response':
          await handleShippingResponse(data);
          break;
      }
    },
  });
});

// Process responses from Inventory service
async function handleInventoryResponse(data) {
  try {
    const { orderId, success, reason } = data;
    
    if (success) {
      await updateOrderStatus(orderId, 'INVENTORY_RESERVED');
      console.log(`Inventory reserved for order ${orderId}`);
    } else {
      await updateOrderStatusWithReason(orderId, 'FAILED', `Inventory reservation failed: ${reason || 'Unknown reason'}`);
      console.log(`Inventory reservation failed for order ${orderId}: ${reason || 'Unknown reason'}`);
    }
  } catch (error) {
    console.error('Error handling inventory response:', error);
  }
}

// Process responses from Payment service
async function handlePaymentResponse(data) {
  try {
    const { orderId, success, reason } = data;
    
    // Get current order status to check if we can proceed
    const order = await getOrderById(orderId);
    
    // Check if order exists and is in a valid state for payment processing
    if (!order) {
      console.log(`Order ${orderId} not found when processing payment response`);
      return;
    }
    
    // Don't process payment failures for completed orders
    if (!success && order.status === 'COMPLETED') {
      console.log(`Ignoring payment failure for order ${orderId} in COMPLETED status`);
      return;
    }
    
    if (success) {
      await updateOrderStatus(orderId, 'PAYMENT_COMPLETED');
      console.log(`Payment completed for order ${orderId}`);
    } else {
      // Only update status if order is not in COMPLETED status
      if (order.status !== 'COMPLETED') {
        await updateOrderStatusWithReason(orderId, 'FAILED', `Payment failed: ${reason || 'Unknown reason'}`);
        console.log(`Payment failed for order ${orderId}: ${reason || 'Unknown reason'}`);
        
        // Get order items from database
        const items = await getOrderItems(orderId);
        
        // Trigger compensation - release inventory
        await publishEvent('release-inventory', {
          orderId,
          items
        });
      }
    }
  } catch (error) {
    console.error('Error handling payment response:', error);
  }
}

// Process responses from Shipping service
async function handleShippingResponse(data) {
  try {
    const { orderId, success, shippingId, reason } = data;
    
    // Get current order status to check if we can proceed
    const order = await getOrderById(orderId);
    
    // Check if order exists
    if (!order) {
      console.log(`Order ${orderId} not found when processing shipping response`);
      return;
    }
    
    if (success) {
      await updateOrderWithShipping(orderId, 'COMPLETED', shippingId);
      console.log(`Order ${orderId} completed with shipping ID ${shippingId}`);
    } else {
      // Only attempt to cancel if not already completed
      if (order.status !== 'COMPLETED') {
        await updateOrderStatusWithReason(orderId, 'FAILED', `Shipping failed: ${reason || 'Unknown reason'}`);
        console.log(`Shipping failed for order ${orderId}: ${reason || 'Unknown reason'}`);
        
        // Trigger compensations only if order is not completed
        await publishEvent('refund-payment', {
          orderId,
          amount: order.totalAmount
        });
        
        const items = await getOrderItems(orderId);
        await publishEvent('release-inventory', {
          orderId,
          items
        });
      } else {
        console.log(`Cannot cancel order ${orderId} in COMPLETED status`);
      }
    }
  } catch (error) {
    console.error('Error handling shipping response:', error);
  }
}

// Database helper functions
async function updateOrderStatus(orderId, status) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE orders SET status = ?, version = version + 1 WHERE orderId = ?', [status, orderId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes);
    });
  });
}

async function updateOrderStatusWithReason(orderId, status, reason) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE orders SET status = ?, reason = ?, version = version + 1 WHERE orderId = ?', 
      [status, reason, orderId], 
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes);
      }
    );
  });
}

async function updateOrderWithShipping(orderId, status, shippingId) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE orders SET status = ?, shippingId = ?, version = version + 1 WHERE orderId = ?', 
      [status, shippingId, orderId], 
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes);
      }
    );
  });
}

async function getOrderById(orderId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM orders WHERE orderId = ?', [orderId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

async function getOrderItems(orderId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM order_items WHERE orderId = ?', [orderId], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// Routes
/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderRequest'
 *     responses:
 *       201:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateOrderResponse'
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/orders', async (req, res) => {
  try {
    const { customerId, items } = req.body;
    
    if (!customerId || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Invalid order data' });
    }
    
    // Calculate total amount (simplified)
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Create a new order
    const orderId = uuidv4();
    const createdAt = new Date().toISOString();
    
    // Insert order into database
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO orders (orderId, customerId, totalAmount, status, createdAt, version) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, customerId, totalAmount, 'PENDING', createdAt, 1],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
    
    // Insert order items
    const orderItemsPromises = items.map(item => {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO order_items (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)',
          [orderId, item.productId, item.quantity, item.price],
          function(err) {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          }
        );
      });
    });
    
    await Promise.all(orderItemsPromises);
    
    // Publish event to start the saga
    const published = await publishEvent('order-created', {
      orderId,
      customerId,
      items,
      totalAmount
    });
    
    if (published) {
      res.status(201).json({
        success: true,
        orderId,
        message: 'Order created successfully and processing has begun'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to initiate order processing'
      });
    }
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /orders/{orderId}:
 *   get:
 *     summary: Get an order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Get order from database
    const order = await getOrderById(orderId);
    
    if (order) {
      // Get order items
      const items = await getOrderItems(orderId);
      order.items = items;
      
      res.json({ success: true, order });
    } else {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Get all orders
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: List of orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 */
app.get('/orders', async (req, res) => {
  try {
    // Get all orders from database
    const orders = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM orders', [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    
    // For each order, get its items
    const ordersWithItems = await Promise.all(orders.map(async (order) => {
      const items = await getOrderItems(order.orderId);
      return { ...order, items };
    }));
    
    res.json({
      success: true,
      orders: ordersWithItems
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Initialize database and start server
initializeDatabase()
  .then(() => {
    // Start server
    app.listen(PORT, () => {
      console.log(`Order Service running on port ${PORT}`);
      console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }); 