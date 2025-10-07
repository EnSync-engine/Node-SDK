require("dotenv").config();
const { EnSyncEngine } = require("../grpc");

console.log("Starting gRPC producer test...");

const response = async () => {
  if (!process.env.ENSYNC_ACCESS_KEY) {
    console.error("ERROR: ENSYNC_ACCESS_KEY environment variable is not set");
    process.exit(1);
  }

  if (!process.env.EVENT_TO_PUBLISH) {
    console.error("ERROR: EVENT_TO_PUBLISH environment variable is not set");
    process.exit(1);
  }

  try {
    // Create gRPC client with insecure connection
    const grpcEngine = new EnSyncEngine("grpc://localhost:50051", {
      heartbeatInterval: 15000, // 15 seconds
      maxReconnectAttempts: 3,
    });

    console.log("Creating gRPC client...");
    const client = await grpcEngine.createClient(process.env.ENSYNC_ACCESS_KEY);
    console.log("Successfully created and authenticated gRPC client");
    console.log("Client ID:", client.getClientPublicKey());

    // Track statistics
    const durations = [];
    const totalStartTime = Date.now();

    // Publish test events
    const eventName = process.env.EVENT_TO_PUBLISH;
    const numEvents = 10;

    for (let index = 0; index < numEvents; index++) {
      const start = Date.now();
      try {
        const result = await client.publish(
          eventName,
          [process.env.RECEIVER_IDENTIFICATION_NUMBER],
          {
            meter_per_seconds: Math.floor(Math.random() * 30),
            event_number: index,
            timestamp: new Date().toISOString(),
          },
          { persist: true, headers: { source: "grpc-producer" } }
        );

        const end = Date.now();
        const duration = end - start;
        durations.push(duration);

        console.log(`Event ${index + 1}/${numEvents} published successfully (${duration}ms)`);
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

    console.log("\n=== Final Statistics ===");
    console.log(`Total requests: ${durations.length}`);
    console.log(`Average duration: ${avg.toFixed(2)} ms`);
    console.log(`Minimum duration: ${min} ms`);
    console.log(`Maximum duration: ${max} ms`);
    console.log("Date of Execution", new Date().toLocaleString());
    console.log(`\nTotal execution time: ${(totalTime / 1000).toFixed(2)} seconds\n`);
    console.log("=====================");
  } catch (error) {
    console.error("Fatal error occurred:", error);
    if (error.cause) {
      console.error("Caused by:", error.cause);
    }
    process.exit(1);
  }
};

response();
