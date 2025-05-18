const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const dbPath = path.resolve(__dirname, '../../../db/shipping-service.db');

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

      // Create shipments table
      db.run(`
        CREATE TABLE IF NOT EXISTS shipments (
          shippingId TEXT PRIMARY KEY,
          orderId TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL,
          carrier TEXT NOT NULL,
          estimatedDelivery TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        )
      `, (err) => {
        if (err) {
          console.error('Error creating shipments table:', err.message);
          reject(err);
          return;
        }

        // Create canceled shipments table
        db.run(`
          CREATE TABLE IF NOT EXISTS canceled_shipments (
            shippingId TEXT PRIMARY KEY,
            orderId TEXT NOT NULL,
            originalStatus TEXT NOT NULL,
            carrier TEXT NOT NULL,
            estimatedDelivery TEXT NOT NULL,
            canceledAt INTEGER NOT NULL,
            originalTimestamp INTEGER NOT NULL
          )
        `, (err) => {
          if (err) {
            console.error('Error creating canceled_shipments table:', err.message);
            reject(err);
            return;
          }

          console.log('Shipping Service database tables created successfully');
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