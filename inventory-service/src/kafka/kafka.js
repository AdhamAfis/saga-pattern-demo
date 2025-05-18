const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'inventory-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'inventory-service-group' });

const setupKafka = async () => {
  await producer.connect();
  await consumer.connect();
  
  // Topics that inventory-service listens to
  await consumer.subscribe({ topics: ['order-created', 'release-inventory'], fromBeginning: true });

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
  consumer
}; 