// Health check endpoint for the shipping service
const express = require('express');

module.exports = function(app) {
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'UP', 
      service: 'shipping-service',
      timestamp: new Date().toISOString()
    });
  });

  console.log('Health endpoint registered for shipping-service');
}; 