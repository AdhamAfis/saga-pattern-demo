const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Payment Service API',
      version: '1.0.0',
      description: 'API documentation for the Payment Service in Saga Pattern Demo',
    },
    servers: [
      {
        url: 'http://localhost:3003',
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Payments',
        description: 'Payment management endpoints',
      },
      {
        name: 'Refunds',
        description: 'Refund management endpoints',
      },
    ],
    components: {
      schemas: {
        Payment: {
          type: 'object',
          properties: {
            paymentId: {
              type: 'string',
              description: 'Payment unique identifier',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            orderId: {
              type: 'string',
              description: 'Order unique identifier',
              example: '450e8400-e29b-41d4-a716-446655440000',
            },
            amount: {
              type: 'number',
              description: 'Payment amount',
              example: 2400,
            },
            status: {
              type: 'string',
              description: 'Payment status',
              example: 'COMPLETED',
              enum: ['PENDING', 'COMPLETED', 'FAILED'],
            },
            timestamp: {
              type: 'integer',
              description: 'Payment timestamp',
              example: 1620467143511,
            },
          },
          required: ['paymentId', 'orderId', 'amount', 'status', 'timestamp'],
        },
        Refund: {
          type: 'object',
          properties: {
            refundId: {
              type: 'string',
              description: 'Refund unique identifier',
              example: '650e8400-e29b-41d4-a716-446655440000',
            },
            paymentId: {
              type: 'string',
              description: 'Payment unique identifier',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            orderId: {
              type: 'string',
              description: 'Order unique identifier',
              example: '450e8400-e29b-41d4-a716-446655440000',
            },
            amount: {
              type: 'number',
              description: 'Refunded amount',
              example: 2400,
            },
            status: {
              type: 'string',
              description: 'Refund status',
              example: 'COMPLETED',
              enum: ['PENDING', 'COMPLETED', 'FAILED'],
            },
            timestamp: {
              type: 'integer',
              description: 'Refund timestamp',
              example: 1620467143511,
            },
          },
          required: ['refundId', 'paymentId', 'orderId', 'amount', 'status', 'timestamp'],
        },
        PaymentResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            payment: {
              $ref: '#/components/schemas/Payment',
            },
          },
        },
        PaymentsResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            payments: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Payment',
              },
            },
          },
        },
        RefundsResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            refunds: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Refund',
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
              example: 'Payment not found',
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