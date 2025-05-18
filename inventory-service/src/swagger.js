const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory Service API',
      version: '1.0.0',
      description: 'API documentation for the Inventory Service in Saga Pattern Demo',
    },
    servers: [
      {
        url: 'http://localhost:3002',
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Inventory',
        description: 'Inventory management endpoints',
      },
      {
        name: 'Reservations',
        description: 'Inventory reservation endpoints',
      },
    ],
    components: {
      schemas: {
        Product: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Product unique identifier',
              example: 'PROD-1',
            },
            name: {
              type: 'string',
              description: 'Product name',
              example: 'Laptop',
            },
            quantity: {
              type: 'integer',
              description: 'Available quantity',
              example: 10,
            },
            price: {
              type: 'number',
              description: 'Product price',
              example: 1200,
            },
          },
          required: ['id', 'name', 'quantity', 'price'],
        },
        Reservation: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Reservation unique identifier',
              example: 1,
            },
            orderId: {
              type: 'string',
              description: 'Order unique identifier',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            items: {
              type: 'array',
              description: 'Reserved items',
              items: {
                type: 'object',
                properties: {
                  productId: {
                    type: 'string',
                    description: 'Product ID',
                    example: 'PROD-1',
                  },
                  name: {
                    type: 'string',
                    description: 'Product name',
                    example: 'Laptop',
                  },
                  quantity: {
                    type: 'integer',
                    description: 'Reserved quantity',
                    example: 2,
                  },
                  unitPrice: {
                    type: 'number',
                    description: 'Unit price',
                    example: 1200,
                  },
                },
              },
            },
            timestamp: {
              type: 'integer',
              description: 'Reservation timestamp',
              example: 1620467143511,
            },
          },
        },
        InventoryResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            inventory: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Product',
              },
            },
          },
        },
        ReservationResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            reservations: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Reservation',
              },
            },
          },
        },
        ProductResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            product: {
              $ref: '#/components/schemas/Product',
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
              example: 'Product not found',
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