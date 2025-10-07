// EnSync Load Test with Worker Threads
require('dotenv').config();
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

// Configuration
const NUM_WORKERS = process.env.NUM_WORKERS || os.cpus().length; // Default to CPU count
const EVENTS_PER_WORKER = process.env.EVENTS_PER_WORKER || 100;
const TEST_DURATION_MS = process.env.TEST_DURATION_MS || 10000; // 10 seconds
const EVENT_NAME = process.env.EVENT_TO_PUBLISH;
const RECEIVER_ID = process.env.RECEIVER_IDENTIFICATION_NUMBER;

// Main thread coordinates the workers
if (isMainThread) {
  console.log(`Starting EnSync load test with ${NUM_WORKERS} workers`);
  console.log(`Each worker will publish up to ${EVENTS_PER_WORKER} events`);
  console.log(`Test will run for ${TEST_DURATION_MS}ms`);
  
  if (!process.env.ENSYNC_ACCESS_KEY) {
    console.error('ERROR: ENSYNC_ACCESS_KEY environment variable is not set');
    process.exit(1);
  }

  if (!EVENT_NAME) {
    console.error('ERROR: EVENT_TO_PUBLISH environment variable is not set');
    process.exit(1);
  }

  if (!RECEIVER_ID) {
    console.error('ERROR: RECEIVER_IDENTIFICATION_NUMBER environment variable is not set');
    process.exit(1);
  }

  // Track results from all workers
  const results = {
    totalEvents: 0,
    successfulEvents: 0,
    failedEvents: 0,
    startTime: Date.now(),
    endTime: 0,
    durations: []
  };

  let completedWorkers = 0;
  
  // Create workers
  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = new Worker(__filename, {
      workerData: {
        workerId: i,
        eventsToPublish: EVENTS_PER_WORKER,
        testDuration: TEST_DURATION_MS
      }
    });
    
    // Handle messages from worker
    worker.on('message', (message) => {
      if (message.type === 'result') {
        // Aggregate worker results
        results.totalEvents += message.data.totalEvents;
        results.successfulEvents += message.data.successfulEvents;
        results.failedEvents += message.data.failedEvents;
        results.durations = results.durations.concat(message.data.durations);
      } else if (message.type === 'log') {
        console.log(`Worker ${i}: ${message.data}`);
      }
    });
    
    // Handle worker completion
    worker.on('exit', () => {
      completedWorkers++;
      console.log(`Worker ${i} completed. (${completedWorkers}/${NUM_WORKERS})`);
      
      // All workers have completed
      if (completedWorkers === NUM_WORKERS) {
        results.endTime = Date.now();
        const testDuration = (results.endTime - results.startTime) / 1000;
        
        // Calculate statistics
        const eventsPerSecond = results.successfulEvents / testDuration;
        const avgDuration = results.durations.length > 0 
          ? results.durations.reduce((a, b) => a + b, 0) / results.durations.length 
          : 0;
        const minDuration = results.durations.length > 0 
          ? Math.min(...results.durations) 
          : 0;
        const maxDuration = results.durations.length > 0 
          ? Math.max(...results.durations) 
          : 0;
        
        // Display results
        console.log('\n=== EnSync Load Test Results ===');
        console.log(`Total test duration: ${testDuration.toFixed(2)} seconds`);
        console.log(`Total events attempted: ${results.totalEvents}`);
        console.log(`Successful events: ${results.successfulEvents}`);
        console.log(`Failed events: ${results.failedEvents}`);
        console.log(`Events per second: ${eventsPerSecond.toFixed(2)}`);
        console.log(`Average event duration: ${avgDuration.toFixed(2)}ms`);
        console.log(`Minimum event duration: ${minDuration}ms`);
        console.log(`Maximum event duration: ${maxDuration}ms`);
        console.log('===============================');
      }
    });
    
    worker.on('error', (err) => {
      console.error(`Worker ${i} error:`, err);
    });
  }
}
// Worker thread publishes events
else {
  const { EnSyncEngine } = require('../websocket');
  const { workerId, eventsToPublish, testDuration } = workerData;
  
  // Send log message to main thread
  function log(message) {
    parentPort.postMessage({ type: 'log', data: message });
  }
  
  // Worker's results
  const workerResults = {
    totalEvents: 0,
    successfulEvents: 0,
    failedEvents: 0,
    durations: []
  };
  
  // Run the worker
  async function runWorker() {
    try {
      log(`Initializing worker ${workerId}`);
      
      // Create EnSync client
      const wsEngine = new EnSyncEngine("ws://localhost:8082", {
        pingInterval: 15000,
        reconnectInterval: 3000,
        maxReconnectAttempts: 3
      });
      
      log(`Connecting to EnSync server...`);
      const client = await wsEngine.createClient(process.env.ENSYNC_ACCESS_KEY);
      log(`Connected to EnSync server`);
      
      // Set end time for the test
      const endTime = Date.now() + testDuration;
      let eventCount = 0;
      
      // Publish events until we reach the limit or time runs out
      while (eventCount < eventsToPublish && Date.now() < endTime) {
        const start = Date.now();
        try {
          workerResults.totalEvents++;
          
          // Create test payload
          const payload = {
            worker_id: workerId,
            event_number: eventCount,
            timestamp: Date.now(),
            meter_per_seconds: Math.floor(Math.random() * 30)
          };
          
          // Publish event
          const result = await client.publish(
            EVENT_NAME,
            [RECEIVER_ID],
            payload,
            { persist: true, headers: { worker: workerId } }
          );
          
          const duration = Date.now() - start;
          workerResults.durations.push(duration);
          workerResults.successfulEvents++;
          
          eventCount++;
          
          // Optional: add small delay to prevent overwhelming the system
          // await new Promise(resolve => setTimeout(resolve, 10));
        } catch (error) {
          workerResults.failedEvents++;
          log(`Error publishing event: ${error.message}`);
        }
      }
      
      log(`Completed ${eventCount} events`);
      
      // Close the connection
      await client.close();
      
      // Send results to main thread
      parentPort.postMessage({ type: 'result', data: workerResults });
    } catch (error) {
      log(`Fatal error: ${error.message}`);
      if (error.cause) {
        log(`Caused by: ${error.cause}`);
      }
      
      // Send partial results if available
      parentPort.postMessage({ type: 'result', data: workerResults });
    }
  }
  
  // Start the worker
  runWorker().catch(error => {
    log(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
}
