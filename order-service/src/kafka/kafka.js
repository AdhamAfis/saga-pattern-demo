const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'order-service-group' });

// For storing event history for educational purposes
let eventHistory = [];

// Function to record events for educational purposes
const recordEvent = (type, topic, data) => {
  if (global.sagaConfig && global.sagaConfig.recordEvents) {
    const event = {
      type,
      topic,
      data,
      timestamp: new Date().toISOString()
    };
    
    if (global.sagaConfig.enableLogging) {
      console.log('Saga event recorded:', event);
    }
    
    global.sagaConfig.eventHistory.push(event);
  }
};

const setupKafka = async () => {
  await producer.connect();
  await consumer.connect();
  
  // Topics that order-service listens to
  await consumer.subscribe({ topics: ['inventory-response', 'payment-response', 'shipping-response'], fromBeginning: true });

  return { producer, consumer };
};

const publishEvent = async (topic, message) => {
  try {
    await producer.send({
      topic,
      messages: [
        { 
          key: String(message.orderId),
          value: JSON.stringify(message)
        }
      ]
    });
    
    // Record the published event for educational purposes
    recordEvent('PUBLISH', topic, message);
    
    console.log(`Event published to topic ${topic}:`, message);
    return true;
  } catch (error) {
    console.error('Error publishing event:', error);
    return false;
  }
};

module.exports = {
  setupKafka,
  publishEvent,
  producer,
  consumer,
  recordEvent
}; 