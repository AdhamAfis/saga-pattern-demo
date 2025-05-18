const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const dbPath = path.resolve(__dirname, '../../../db/order-service.db');

// Create a new database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log(`Connected to SQLite database at ${dbPath}`);
});

// Create tables
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON', (err) => {
      if (err) {
        console.error('Error enabling foreign keys:', err.message);
        reject(err);
        return;
      }

      // Create orders table
      db.run(`
        CREATE TABLE IF NOT EXISTS orders (
          orderId TEXT PRIMARY KEY,
          customerId TEXT NOT NULL,
          totalAmount REAL NOT NULL,
          status TEXT NOT NULL,
          reason TEXT,
          shippingId TEXT,
          createdAt TEXT NOT NULL,
          version INTEGER DEFAULT 1
        )
      `, (err) => {
        if (err) {
          console.error('Error creating orders table:', err.message);
          reject(err);
          return;
        }

        // Create order_items table
        db.run(`
          CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orderId TEXT NOT NULL,
            productId TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (orderId) REFERENCES orders (orderId) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) {
            console.error('Error creating order_items table:', err.message);
            reject(err);
            return;
          }

          console.log('Order Service database tables created successfully');
          resolve();
        });
      });
    });
  });
}

// Execute directly if this script is run directly
if (require.main === module) {
  // Create db directory if it doesn't exist
  const fs = require('fs');
  const dbDir = path.dirname(dbPath);
  
  if (!fs.existsSync(dbDir)) {
    console.log(`Creating directory: ${dbDir}`);
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  initializeDatabase()
    .then(() => {
      console.log('Database initialization completed successfully');
      db.close();
    })
    .catch((err) => {
      console.error('Database initialization failed:', err);
      db.close();
      process.exit(1);
    });
}

module.exports = {
  db,
  initializeDatabase
}; 