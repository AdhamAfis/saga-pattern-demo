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

const PORT = process.env.SERVICE_PORT || 3004;

// Initialize Kafka
setupKafka().then(() => {
  console.log('Kafka setup complete for Shipping Service');

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'UP', 
      service: 'shipping-service',
      timestamp: new Date().toISOString()
    });
  });

  // Listen for payment-completed events
  consumer.run({
    eachMessage: async ({ topic, message }) => {
      const data = JSON.parse(message.value.toString());
      console.log(`Received message from ${topic}:`, data);

      if (topic === 'payment-completed') {
        await processShipping(data);
      } else if (topic === 'cancel-shipping') {
        await cancelShipping(data);
      }
    },
  });
});

// Process shipping for an order
async function processShipping(data) {
  const { orderId, testFlags } = data;
  let success = true;
  let reason = '';
  let shippingId = null;

  try {
    // For educational purposes - check test flags to simulate failures
    if (testFlags && testFlags.failShipping) {
      console.log(`[TEST MODE] Simulating shipping failure for order ${orderId}`);
      success = false;
      reason = 'Simulated shipping failure for educational purposes';
    } else {
      // Normal shipping processing logic
      // Simulate shipping arrangement
      // In a real application, this would call a shipping provider API
      
      // For demo purposes, randomly succeed or fail
      // 95% chance of success
      if (Math.random() > 0.05) {
        shippingId = uuidv4();
        
        // Store shipping information in database
        await createShipment(shippingId, orderId);
        
        console.log(`Shipping ${shippingId} arranged for order ${orderId}`);
      } else {
        success = false;
        reason = 'Unable to arrange shipping at this time';
        console.log(`Shipping failed for order ${orderId}: ${reason}`);
      }
    }
    
    // Publish shipping result to order service
    await publishEvent('shipping-response', {
      orderId,
      success,
      shippingId,
      reason,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error(`Error arranging shipping for order ${orderId}:`, error);
    await publishEvent('shipping-response', {
      orderId,
      success: false,
      reason: 'Internal shipping service error',
      timestamp: Date.now()
    });
  }
}

// Cancel shipping (compensation)
async function cancelShipping(data) {
  const { orderId } = data;
  
  try {
    // Find shipment for this order
    const shipment = await findShipmentByOrderId(orderId);
    
    if (!shipment) {
      console.log(`No shipment found for order ${orderId} to cancel`);
      return;
    }
    
    // Cancel shipment
    await cancelShipmentInDb(shipment);
    
    console.log(`Shipment ${shipment.shippingId} canceled for order ${orderId}`);
    
  } catch (error) {
    console.error(`Error canceling shipment for order ${orderId}:`, error);
  }
}

// Database helper functions
async function createShipment(shippingId, orderId) {
  const carrier = getRandomCarrier();
  const estimatedDelivery = getEstimatedDeliveryDate();
  const timestamp = Date.now();

  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO shipments (shippingId, orderId, status, carrier, estimatedDelivery, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [shippingId, orderId, 'SCHEDULED', carrier, estimatedDelivery, timestamp],
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

async function findShipmentByOrderId(orderId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM shipments WHERE orderId = ?', [orderId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

async function cancelShipmentInDb(shipment) {
  // First insert into canceled_shipments table
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO canceled_shipments (shippingId, orderId, originalStatus, carrier, estimatedDelivery, canceledAt, originalTimestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        shipment.shippingId,
        shipment.orderId,
        shipment.status,
        shipment.carrier,
        shipment.estimatedDelivery,
        Date.now(),
        shipment.timestamp
      ],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
  
  // Then delete from active shipments
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM shipments WHERE shippingId = ?', [shipment.shippingId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes);
    });
  });
}

// Helper: Get random carrier
function getRandomCarrier() {
  const carriers = ['FedEx', 'UPS', 'DHL', 'USPS'];
  return carriers[Math.floor(Math.random() * carriers.length)];
}

// Helper: Get estimated delivery date (5-10 days from now)
function getEstimatedDeliveryDate() {
  const days = Math.floor(Math.random() * 6) + 5; // 5-10 days
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

// Routes
/**
 * @swagger
 * /shipments:
 *   get:
 *     summary: Get all shipments
 *     tags: [Shipments]
 *     responses:
 *       200:
 *         description: List of all shipments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShipmentsResponse'
 */
app.get('/shipments', async (req, res) => {
  try {
    const shipments = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM shipments', [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    
    res.json({
      success: true,
      shipments
    });
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /shipments/{shippingId}:
 *   get:
 *     summary: Get shipment by ID
 *     tags: [Shipments]
 *     parameters:
 *       - in: path
 *         name: shippingId
 *         required: true
 *         schema:
 *           type: string
 *         description: Shipping ID
 *     responses:
 *       200:
 *         description: Shipment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShipmentResponse'
 *       404:
 *         description: Shipment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/shipments/:shippingId', async (req, res) => {
  try {
    const { shippingId } = req.params;
    
    const shipment = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM shipments WHERE shippingId = ?', [shippingId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
    
    if (shipment) {
      res.json({ success: true, shipment });
    } else {
      res.status(404).json({
        success: false,
        message: 'Shipment not found'
      });
    }
  } catch (error) {
    console.error('Error fetching shipment:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /shipments/order/{orderId}:
 *   get:
 *     summary: Get shipment by order ID
 *     tags: [Shipments]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Shipment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShipmentResponse'
 *       404:
 *         description: Shipment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/shipments/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const shipment = await findShipmentByOrderId(orderId);
    
    if (shipment) {
      res.json({ success: true, shipment });
    } else {
      res.status(404).json({
        success: false,
        message: 'No shipment found for this order'
      });
    }
  } catch (error) {
    console.error('Error fetching shipment by order ID:', error);
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
      console.log(`Shipping Service running on port ${PORT}`);
      console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }); 