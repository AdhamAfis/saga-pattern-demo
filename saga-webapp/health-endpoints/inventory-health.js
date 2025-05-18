// Health check endpoint for the inventory service
const express = require('express');

module.exports = function(app) {
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'UP', 
      service: 'inventory-service',
      timestamp: new Date().toISOString()
    });
  });

  console.log('Health endpoint registered for inventory-service');
}; 