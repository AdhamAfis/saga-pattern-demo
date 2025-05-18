// Health check endpoint for the payment service
const express = require('express');

module.exports = function(app) {
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'UP', 
      service: 'payment-service',
      timestamp: new Date().toISOString()
    });
  });

  console.log('Health endpoint registered for payment-service');
}; 