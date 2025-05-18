const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const dbPath = path.resolve(__dirname, '../../../db/inventory-service.db');

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

      // Create products table
      db.run(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          price REAL NOT NULL
        )
      `, (err) => {
        if (err) {
          console.error('Error creating products table:', err.message);
          reject(err);
          return;
        }

        // Create reservations table
        db.run(`
          CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orderId TEXT NOT NULL UNIQUE,
            timestamp INTEGER NOT NULL
          )
        `, (err) => {
          if (err) {
            console.error('Error creating reservations table:', err.message);
            reject(err);
            return;
          }

          // Create reserved_items table
          db.run(`
            CREATE TABLE IF NOT EXISTS reserved_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              reservationId INTEGER NOT NULL,
              productId TEXT NOT NULL,
              quantity INTEGER NOT NULL,
              unitPrice REAL NOT NULL,
              FOREIGN KEY (reservationId) REFERENCES reservations (id) ON DELETE CASCADE,
              FOREIGN KEY (productId) REFERENCES products (id)
            )
          `, (err) => {
            if (err) {
              console.error('Error creating reserved_items table:', err.message);
              reject(err);
              return;
            }

            // Insert sample products if they don't exist
            const sampleProducts = [
              { id: 'PROD-1', name: 'Laptop', quantity: 10, price: 1200 },
              { id: 'PROD-2', name: 'Phone', quantity: 20, price: 800 },
              { id: 'PROD-3', name: 'Tablet', quantity: 15, price: 500 }
            ];

            const insertPromises = sampleProducts.map(product => {
              return new Promise((resolve, reject) => {
                db.get('SELECT id FROM products WHERE id = ?', [product.id], (err, row) => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  if (!row) {
                    db.run(
                      'INSERT INTO products (id, name, quantity, price) VALUES (?, ?, ?, ?)',
                      [product.id, product.name, product.quantity, product.price],
                      (err) => {
                        if (err) {
                          reject(err);
                          return;
                        }
                        resolve();
                      }
                    );
                  } else {
                    resolve();
                  }
                });
              });
            });

            Promise.all(insertPromises)
              .then(() => {
                console.log('Inventory Service database tables created successfully');
                resolve();
              })
              .catch(err => {
                console.error('Error inserting sample products:', err);
                reject(err);
              });
          });
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