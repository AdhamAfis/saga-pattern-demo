const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Order Service API',
      version: '1.0.0',
      description: 'API documentation for the Order Service in Saga Pattern Demo',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Orders',
        description: 'Order management endpoints',
      },
    ],
    components: {
      schemas: {
        Order: {
          type: 'object',
          properties: {
            orderId: {
              type: 'string',
              description: 'Unique identifier for the order',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            customerId: {
              type: 'string',
              description: 'Customer ID',
              example: 'cust123',
            },
            items: {
              type: 'array',
              description: 'List of ordered items',
              items: {
                type: 'object',
                properties: {
                  productId: {
                    type: 'string',
                    description: 'Product ID',
                    example: 'PROD-1',
                  },
                  quantity: {
                    type: 'integer',
                    description: 'Quantity ordered',
                    example: 2,
                  },
                  price: {
                    type: 'number',
                    description: 'Price per unit',
                    example: 1200,
                  },
                },
              },
            },
            totalAmount: {
              type: 'number',
              description: 'Total order amount',
              example: 2400,
            },
            status: {
              type: 'string',
              description: 'Current order status',
              example: 'PENDING',
              enum: ['PENDING', 'INVENTORY_RESERVED', 'PAYMENT_COMPLETED', 'COMPLETED', 'FAILED'],
            },
            reason: {
              type: 'string',
              description: 'Failure reason if status is FAILED',
              example: 'Payment declined',
            },
            shippingId: {
              type: 'string',
              description: 'Shipping ID for completed orders',
              example: '123456789',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Order creation timestamp',
              example: '2023-05-08T14:25:43.511Z',
            },
          },
          required: ['orderId', 'customerId', 'items', 'totalAmount', 'status', 'createdAt'],
        },
        CreateOrderRequest: {
          type: 'object',
          properties: {
            customerId: {
              type: 'string',
              description: 'Customer ID',
              example: 'cust123',
            },
            items: {
              type: 'array',
              description: 'List of items to order',
              items: {
                type: 'object',
                properties: {
                  productId: {
                    type: 'string',
                    description: 'Product ID',
                    example: 'PROD-1',
                  },
                  quantity: {
                    type: 'integer',
                    description: 'Quantity to order',
                    example: 2,
                  },
                  price: {
                    type: 'number',
                    description: 'Price per unit',
                    example: 1200,
                  },
                },
                required: ['productId', 'quantity', 'price'],
              },
            },
          },
          required: ['customerId', 'items'],
        },
        CreateOrderResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Operation success status',
              example: true,
            },
            orderId: {
              type: 'string',
              description: 'Created order ID',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            message: {
              type: 'string',
              description: 'Response message',
              example: 'Order created successfully and processing has begun',
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Invalid order data',
            },
          },
        },
      },
    },
  },
  apis: ['./src/main.js'], // Path to the API routes
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec; 