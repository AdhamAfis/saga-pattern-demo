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

const PORT = process.env.SERVICE_PORT || 3003;

// Initialize Kafka
setupKafka().then(() => {
  console.log('Kafka setup complete for Payment Service');
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'UP', 
      service: 'payment-service',
      timestamp: new Date().toISOString()
    });
  });

  // Listen for inventory-reserved events
  consumer.run({
    eachMessage: async ({ topic, message }) => {
      const data = JSON.parse(message.value.toString());
      console.log(`Received message from ${topic}:`, data);

      if (topic === 'inventory-reserved') {
        await processPayment(data);
      } else if (topic === 'refund-payment') {
        await processRefund(data);
      }
    },
  });
});

// Process payment for an order
async function processPayment(data) {
  const { orderId, totalAmount, testFlags } = data;
  let success = true;
  let reason = '';
  let paymentId = null;

  try {
    // For educational purposes - check test flags to simulate failures
    if (testFlags && testFlags.failPayment) {
      console.log(`[TEST MODE] Simulating payment failure for order ${orderId}`);
      success = false;
      reason = 'Simulated payment failure for educational purposes';
    } else {
      // Normal payment processing logic
      // Simulate payment processing
      // In a real application, this would call a payment gateway
      
      // For demo purposes, randomly approve or reject payments
      // 90% chance of success
      if (Math.random() > 0.1) {
        paymentId = uuidv4();
        
        // Store payment information in database
        await createPayment(paymentId, orderId, totalAmount, 'COMPLETED');
        
        console.log(`Payment ${paymentId} processed successfully for order ${orderId}`);
      } else {
        success = false;
        reason = 'Payment declined by payment processor';
        console.log(`Payment declined for order ${orderId}: ${reason}`);
      }
    }
    
    // Publish payment result
    if (success) {
      // Trigger next step in saga
      await publishEvent('payment-completed', {
        orderId,
        paymentId,
        amount: totalAmount,
        testFlags // Pass test flags to next service
      });
    }
    
    // Always send response to order service
    await publishEvent('payment-response', {
      orderId,
      success,
      paymentId,
      reason,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error(`Error processing payment for order ${orderId}:`, error);
    await publishEvent('payment-response', {
      orderId,
      success: false,
      reason: 'Internal payment service error',
      timestamp: Date.now()
    });
  }
}

// Process refund (compensation)
async function processRefund(data) {
  const { orderId, amount } = data;
  
  try {
    // Find payment for this order
    const payment = await findPaymentByOrderId(orderId);
    
    if (!payment) {
      console.log(`No payment found for order ${orderId} to refund`);
      return;
    }
    
    // Check if we have a refund already processed for this order
    const existingRefund = await findRefundByOrderId(orderId);
    if (existingRefund) {
      console.log(`Refund already processed for order ${orderId}, skipping duplicate`);
      return;
    }
    
    // Process refund
    const refundId = uuidv4();
    await createRefund(refundId, payment.paymentId, orderId, amount, 'COMPLETED');
    
    console.log(`Refund ${refundId} processed for order ${orderId}`);
    
  } catch (error) {
    console.error(`Error processing refund for order ${orderId}:`, error);
  }
}

// Database helper functions
async function createPayment(paymentId, orderId, amount, status) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO payments (paymentId, orderId, amount, status, timestamp) VALUES (?, ?, ?, ?, ?)', 
      [paymentId, orderId, amount, status, Date.now()], 
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      }
    );
  });
}

async function findPaymentByOrderId(orderId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM payments WHERE orderId = ?', [orderId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

async function createRefund(refundId, paymentId, orderId, amount, status) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO refunds (refundId, paymentId, orderId, amount, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)', 
      [refundId, paymentId, orderId, amount, status, Date.now()], 
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      }
    );
  });
}

async function findRefundByOrderId(orderId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM refunds WHERE orderId = ?', [orderId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

// Routes
/**
 * @swagger
 * /payments:
 *   get:
 *     summary: Get all payments
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: List of all payments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentsResponse'
 */
app.get('/payments', async (req, res) => {
  try {
    const payments = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM payments', [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    
    res.json({
      success: true,
      payments
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /payments/{paymentId}:
 *   get:
 *     summary: Get payment by ID
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentResponse'
 *       404:
 *         description: Payment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/payments/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM payments WHERE paymentId = ?', [paymentId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
    
    if (payment) {
      res.json({ success: true, payment });
    } else {
      res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /refunds:
 *   get:
 *     summary: Get all refunds
 *     tags: [Refunds]
 *     responses:
 *       200:
 *         description: List of all refunds
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefundsResponse'
 */
app.get('/refunds', async (req, res) => {
  try {
    const refunds = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM refunds', [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    
    res.json({
      success: true,
      refunds
    });
  } catch (error) {
    console.error('Error fetching refunds:', error);
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
      console.log(`Payment Service running on port ${PORT}`);
      console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }); 