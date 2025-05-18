const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const dbPath = path.resolve(__dirname, '../../../db/payment-service.db');

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

      // Create payments table
      db.run(`
        CREATE TABLE IF NOT EXISTS payments (
          paymentId TEXT PRIMARY KEY,
          orderId TEXT NOT NULL,
          amount REAL NOT NULL,
          status TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        )
      `, (err) => {
        if (err) {
          console.error('Error creating payments table:', err.message);
          reject(err);
          return;
        }

        // Create refunds table
        db.run(`
          CREATE TABLE IF NOT EXISTS refunds (
            refundId TEXT PRIMARY KEY,
            paymentId TEXT NOT NULL,
            orderId TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (paymentId) REFERENCES payments (paymentId)
          )
        `, (err) => {
          if (err) {
            console.error('Error creating refunds table:', err.message);
            reject(err);
            return;
          }

          console.log('Payment Service database tables created successfully');
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