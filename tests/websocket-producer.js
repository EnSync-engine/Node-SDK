require('dotenv').config();
const { EnSyncEngine } = require('../websocket');

console.log('Starting WebSocket producer test...');

const response = async () => {
  if (!process.env.ENSYNC_ACCESS_KEY) {
    console.error('ERROR: ENSYNC_ACCESS_KEY environment variable is not set');
    process.exit(1);
  }

  if (!process.env.EVENT_TO_PUBLISH) {
    console.error('ERROR: EVENT_TO_PUBLISH environment variable is not set');
    process.exit(1);
  }

  // console.log('Initializing WebSocket client...');
  // console.log('Access Key:', process.env.ENSYNC_ACCESS_KEY.substring(0, 10) + '...');
  // console.log('Event to publish:', process.env.EVENT_TO_PUBLISH);

  try {
    const wsEngine = new EnSyncEngine("ws://localhost:8082", {
      pingInterval: 15000, // 15 seconds
      reconnectInterval: 3000, // 3 seconds
      maxReconnectAttempts: 3
    });

    console.log('Creating WebSocket client...');
    const client = await wsEngine.createClient(process.env.ENSYNC_ACCESS_KEY);
    console.log('Successfully created and authenticated WebSocket client');


    // Track statistics
    const durations = [];
    const totalStartTime = Date.now();

    // Publish test events
    const eventName = process.env.EVENT_TO_PUBLISH;
    for (let index = 0; index < 3; index++) {
      const start = Date.now();
      try {
        const result = await client.publish(
          eventName, 
          [process.env.RECEIVER_IDENTIFICATION_NUMBER], 
          {
            "meter_per_seconds": Math.floor(Math.random() * 30),
          },
          { persist: true, headers: {} }
        );
        
        const end = Date.now();
        const duration = end - start;
        durations.push(duration);
      } catch (error) {
        console.error(`Error publishing event ${index}:`, error);
      }
    }
    await client.close();

    // Calculate and display final statistics
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const totalTime = Date.now() - totalStartTime;
    console.log('\n=== Final Statistics ===');
    console.log(`Total requests: ${durations.length}`);
    console.log(`Average duration: ${avg.toFixed(2)} ms`);
    console.log(`Minimum duration: ${min} ms`);
    console.log(`Maximum duration: ${max} ms`);
    console.log("Date of Execution", new Date().toLocaleString());
    console.log(`\nTotal execution time: ${(totalTime / 1000).toFixed(2)} seconds\n`);
    console.log('=====================');

  } catch (error) {
    console.error('Fatal error occurred:', error);
    if (error.cause) {
      console.error('Caused by:', error.cause);
    }
    process.exit(1);
  }
};

response();
