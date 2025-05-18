const express = require('express');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const { setupKafka, publishEvent, consumer } = require('./kafka/kafka');
const { db, initializeDatabase } = require('./db/init-db');

const app = express();
app.use(bodyParser.json());

// Serve Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = process.env.SERVICE_PORT || 3002;

// Initialize Kafka
setupKafka().then(() => {
  console.log('Kafka setup complete for Inventory Service');

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'UP', 
      service: 'inventory-service',
      timestamp: new Date().toISOString()
    });
  });

  // Listen for order events
  consumer.run({
    eachMessage: async ({ topic, message }) => {
      const data = JSON.parse(message.value.toString());
      console.log(`Received message from ${topic}:`, data);

      if (topic === 'order-created') {
        await processOrderCreated(data);
      } else if (topic === 'release-inventory') {
        await processReleaseInventory(data);
      }
    },
  });
});

// Process "order-created" event
async function processOrderCreated(orderData) {
  const { orderId, items, testFlags } = orderData;
  let success = true;
  let reason = '';

  try {
    // For educational purposes - check test flags to simulate failures
    if (testFlags && testFlags.failInventory) {
      console.log(`[TEST MODE] Simulating inventory failure for order ${orderId}`);
      success = false;
      reason = 'Simulated inventory reservation failure for educational purposes';
    } else {
      // Normal inventory processing logic
      const unavailableItems = [];
      
      // Check if all items are available in requested quantities
      for (const item of items) {
        const product = await getProductById(item.productId);
        
        if (!product) {
          unavailableItems.push(`Product ${item.productId} not found`);
          continue;
        }
        
        if (product.quantity < item.quantity) {
          unavailableItems.push(`Insufficient quantity for ${product.name} (requested: ${item.quantity}, available: ${product.quantity})`);
        }
      }
      
      if (unavailableItems.length > 0) {
        success = false;
        reason = unavailableItems.join('; ');
      } else {
        // Create reservation
        const reservationId = await createReservation(orderId);
        
        // Reserve inventory for each item
        for (const item of items) {
          const product = await getProductById(item.productId);
          
          // Reduce available quantity
          await updateProductQuantity(product.id, product.quantity - item.quantity);
          
          // Add to reservation
          await addReservedItem(reservationId, product.id, item.quantity, product.price);
        }
      }
    }
    
    // Publish inventory response
    if (success) {
      // Get all products with updated quantities
      const updatedProducts = await Promise.all(
        items.map(item => getProductById(item.productId))
      );
      
      // If successful, publish event for payment service
      await publishEvent('inventory-reserved', {
        orderId,
        items: items.map(item => {
          const product = updatedProducts.find(p => p.id === item.productId);
          return {
            productId: item.productId,
            name: product.name,
            quantity: item.quantity,
            unitPrice: product.price
          };
        }),
        totalAmount: items.reduce((sum, item) => {
          const product = updatedProducts.find(p => p.id === item.productId);
          return sum + (product.price * item.quantity);
        }, 0),
        testFlags // Pass test flags to next service
      });
    }
    
    // Always send response back to order service
    await publishEvent('inventory-response', {
      orderId,
      success,
      reason,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error(`Error processing order ${orderId}:`, error);
    await publishEvent('inventory-response', {
      orderId,
      success: false,
      reason: 'Internal inventory service error',
      timestamp: Date.now()
    });
  }
}

// Process "release-inventory" event (compensation)
async function processReleaseInventory(data) {
  const { orderId } = data;
  
  try {
    // Find reservation for this order
    const reservation = await getReservationByOrderId(orderId);
    
    if (!reservation) {
      console.log(`No reservation found for order ${orderId}`);
      return;
    }
    
    // Get reserved items
    const reservedItems = await getReservedItems(reservation.id);
    console.log(`Found ${reservedItems.length} reserved items for order ${orderId}`);
    
    // Return items to inventory
    for (const item of reservedItems) {
      const product = await getProductById(item.productId);
      if (product) {
        // Calculate new quantity
        const newQuantity = product.quantity + item.quantity;
        console.log(`Returning ${item.quantity} units of ${item.productId} to inventory. New quantity: ${newQuantity}`);
        
        // Update product quantity
        await updateProductQuantity(item.productId, newQuantity);
      } else {
        console.log(`Product ${item.productId} not found, cannot return to inventory`);
      }
    }
    
    // Remove reservation
    await deleteReservation(reservation.id);
    
    console.log(`Inventory released for order ${orderId}`);
  } catch (error) {
    console.error(`Error releasing inventory for order ${orderId}:`, error);
  }
}

// Database helper functions
async function getProductById(productId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

async function updateProductQuantity(productId, newQuantity) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE products SET quantity = ? WHERE id = ?', [newQuantity, productId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes);
    });
  });
}

async function createReservation(orderId) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    db.run('INSERT INTO reservations (orderId, timestamp) VALUES (?, ?)', 
      [orderId, timestamp], 
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

async function addReservedItem(reservationId, productId, quantity, unitPrice) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO reserved_items (reservationId, productId, quantity, unitPrice) VALUES (?, ?, ?, ?)', 
      [reservationId, productId, quantity, unitPrice], 
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

async function getReservationByOrderId(orderId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM reservations WHERE orderId = ?', [orderId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

async function getReservedItems(reservationId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM reserved_items WHERE reservationId = ?', [reservationId], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function deleteReservation(reservationId) {
  // Since we have CASCADE on the foreign key, deleting the reservation will also delete related items
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM reservations WHERE id = ?', [reservationId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes);
    });
  });
}

// Routes
/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Get all products in inventory
 *     tags: [Inventory]
 *     responses:
 *       200:
 *         description: List of all products
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryResponse'
 */
app.get('/inventory', async (req, res) => {
  try {
    const inventory = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM products', [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    
    res.json({
      success: true,
      inventory
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /inventory/{productId}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/inventory/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await getProductById(productId);
    
    if (product) {
      res.json({ success: true, product });
    } else {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /reservations:
 *   get:
 *     summary: Get all reservations
 *     tags: [Reservations]
 *     responses:
 *       200:
 *         description: List of all reservations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReservationResponse'
 */
app.get('/reservations', async (req, res) => {
  try {
    // Get all reservations
    const reservations = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM reservations', [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    
    // For each reservation, get the reserved items
    const reservationsWithItems = await Promise.all(reservations.map(async (reservation) => {
      const items = await getReservedItems(reservation.id);
      return { ...reservation, items };
    }));
    
    res.json({
      success: true,
      reservations: reservationsWithItems
    });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /reservations/{orderId}:
 *   get:
 *     summary: Get reservation by order ID
 *     tags: [Reservations]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Reservation details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 reservation:
 *                   $ref: '#/components/schemas/Reservation'
 *       404:
 *         description: Reservation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/reservations/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const reservation = await getReservationByOrderId(orderId);
    
    if (reservation) {
      // Get reserved items
      const items = await getReservedItems(reservation.id);
      reservation.items = items;
      
      res.json({ success: true, reservation });
    } else {
      res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }
  } catch (error) {
    console.error('Error fetching reservation:', error);
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
      console.log(`Inventory Service running on port ${PORT}`);
      console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }); 