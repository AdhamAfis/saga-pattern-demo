const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Shipping Service API',
      version: '1.0.0',
      description: 'API documentation for the Shipping Service in Saga Pattern Demo',
    },
    servers: [
      {
        url: 'http://localhost:3004',
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Shipments',
        description: 'Shipping management endpoints',
      },
    ],
    components: {
      schemas: {
        Shipment: {
          type: 'object',
          properties: {
            shippingId: {
              type: 'string',
              description: 'Shipping unique identifier',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            orderId: {
              type: 'string',
              description: 'Order unique identifier',
              example: '450e8400-e29b-41d4-a716-446655440000',
            },
            status: {
              type: 'string',
              description: 'Shipping status',
              example: 'SCHEDULED',
              enum: ['SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'CANCELED'],
            },
            carrier: {
              type: 'string',
              description: 'Shipping carrier',
              example: 'FedEx',
            },
            estimatedDelivery: {
              type: 'string',
              format: 'date-time',
              description: 'Estimated delivery date',
              example: '2023-05-15T14:25:43.511Z',
            },
            timestamp: {
              type: 'integer',
              description: 'Shipping creation timestamp',
              example: 1620467143511,
            },
          },
          required: ['shippingId', 'orderId', 'status', 'carrier', 'estimatedDelivery', 'timestamp'],
        },
        ShipmentResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            shipment: {
              $ref: '#/components/schemas/Shipment',
            },
          },
        },
        ShipmentsResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            shipments: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Shipment',
              },
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
              example: 'Shipment not found',
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