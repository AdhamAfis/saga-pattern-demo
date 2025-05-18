#!/bin/bash

# This script adds health endpoints to all microservices
# Run from the project root directory

# Add health endpoint to inventory-service
if grep -q "/health" inventory-service/src/main.js; then
  echo "Health endpoint already exists in inventory-service"
else
  echo "Adding health endpoint to inventory-service..."
  sed -i '' 's/const PORT = process.env.SERVICE_PORT || 3002;/const PORT = process.env.SERVICE_PORT || 3002;\n\n\/\/ Health check endpoint\napp.get("\/health", (req, res) => {\n  res.status(200).json({ \n    status: "UP", \n    service: "inventory-service",\n    timestamp: new Date().toISOString()\n  });\n});/g' inventory-service/src/main.js
fi

# Add health endpoint to payment-service
if grep -q "/health" payment-service/src/main.js; then
  echo "Health endpoint already exists in payment-service"
else
  echo "Adding health endpoint to payment-service..."
  sed -i '' 's/const PORT = process.env.SERVICE_PORT || 3003;/const PORT = process.env.SERVICE_PORT || 3003;\n\n\/\/ Health check endpoint\napp.get("\/health", (req, res) => {\n  res.status(200).json({ \n    status: "UP", \n    service: "payment-service",\n    timestamp: new Date().toISOString()\n  });\n});/g' payment-service/src/main.js
fi

# Add health endpoint to shipping-service
if grep -q "/health" shipping-service/src/main.js; then
  echo "Health endpoint already exists in shipping-service"
else
  echo "Adding health endpoint to shipping-service..."
  sed -i '' 's/const PORT = process.env.SERVICE_PORT || 3004;/const PORT = process.env.SERVICE_PORT || 3004;\n\n\/\/ Health check endpoint\napp.get("\/health", (req, res) => {\n  res.status(200).json({ \n    status: "UP", \n    service: "shipping-service",\n    timestamp: new Date().toISOString()\n  });\n});/g' shipping-service/src/main.js
fi

echo "Health endpoints added to all services" 