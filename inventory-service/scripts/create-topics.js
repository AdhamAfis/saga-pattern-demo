const { Kafka } = require('kafkajs');

// Kafka client configuration
const kafka = new Kafka({
  clientId: 'topic-creator',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

const admin = kafka.admin();

// List of topics with configurations
const topics = [
  {
    topic: 'order-created',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' }
    ]
  },
  {
    topic: 'inventory-reserved',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' }
    ]
  },
  {
    topic: 'inventory-response',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' }
    ]
  },
  {
    topic: 'payment-completed',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' }
    ]
  },
  {
    topic: 'payment-response',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' }
    ]
  },
  {
    topic: 'shipping-response',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' }
    ]
  },
  {
    topic: 'release-inventory',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' }
    ]
  },
  {
    topic: 'refund-payment',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' }
    ]
  },
  {
    topic: 'cancel-shipping',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' }
    ]
  }
];

// Function to create topics
async function createTopics() {
  try {
    console.log('Connecting to Kafka...');
    await admin.connect();
    console.log('Connected! Fetching existing topics...');
    
    // Get existing topics
    const existingTopics = await admin.listTopics();
    
    // Filter out topics that already exist
    const topicsToCreate = topics.filter(topic => !existingTopics.includes(topic.topic));
    
    if (topicsToCreate.length === 0) {
      console.log('All topics already exist. No new topics created.');
    } else {
      console.log(`Creating ${topicsToCreate.length} topics...`);
      await admin.createTopics({
        topics: topicsToCreate,
        waitForLeaders: true
      });
      console.log('Topics created successfully!');
      
      // List all topics for verification
      const allTopics = await admin.listTopics();
      console.log('All available topics:', allTopics);
    }
  } catch (error) {
    console.error('Error creating Kafka topics:', error);
  } finally {
    await admin.disconnect();
  }
}

// Execute if run directly
if (require.main === module) {
  createTopics().then(() => {
    console.log('Script completed.');
  });
}

module.exports = { createTopics }; 