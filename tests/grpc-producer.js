require("dotenv").config();
const { EnSyncEngine } = require("../packages/ensync-client-sdk/grpc");

console.log("Starting gRPC producer test...");

const response = async () => {
  const appKey = process.env.ENSYNC_ACCESS_KEY || process.env.CLIENT_ACCESS_KEY;
  
  if (!appKey) {
    console.error("ERROR: ENSYNC_ACCESS_KEY or CLIENT_ACCESS_KEY environment variable is not set");
    process.exit(1);
  }

  if (!process.env.MESSAGE_TO_PUBLISH) {
    console.error("ERROR: MESSAGE_TO_PUBLISH environment variable is not set");
    process.exit(1);
  }

  try {
    // Create gRPC client with insecure connection
    const grpcEngine = new EnSyncEngine("grpc://localhost:50051", {
      heartbeatInterval: 15000, // 15 seconds
      maxReconnectAttempts: 3,
    });

    console.log("Creating gRPC client...");
    const client = await grpcEngine.createClient(appKey);
    console.log("Successfully created and authenticated gRPC client");
    console.log("Client ID:", client.getClientPublicKey());

    // Track detailed statistics
    const stats = {
      totalDurations: [],
      encryptionTimes: [],
      publishTimes: [],
      payloadSizes: [],
      timestamps: [],
    };
    
    const totalStartTime = Date.now();

    // Publish test messages
    const messageName = process.env.MESSAGE_TO_PUBLISH;
    const numMessages = 100;
    const recipient = process.env.RECEIVER_IDENTIFICATION_NUMBER;

    console.log(`\nPublishing ${numMessages} messages to ${messageName}...\n`);

    for (let index = 0; index < numMessages; index++) {
      const payload = {
        meter_per_seconds: Math.floor(Math.random() * 30),
        event_number: index,
        timestamp: new Date().toISOString(),
        data: `Test message ${index}`,
      };

      const messageStartTime = Date.now();
      
      try {
        // Measure encryption time (simulate by measuring payload analysis)
        const encryptStartTime = Date.now();
        const payloadSize = client.getPayloadByteSize(payload);
        const encryptEndTime = Date.now();
        const encryptionTime = encryptEndTime - encryptStartTime;

        // Measure actual publish time
        const publishStartTime = Date.now();
        const result = await client.publish(
          messageName,
          [recipient],
          payload,
          { persist: true, headers: { source: "grpc-producer" } }
        );
        const publishEndTime = Date.now();
        const publishTime = publishEndTime - publishStartTime;

        const totalDuration = Date.now() - messageStartTime;

        // Store statistics
        stats.totalDurations.push(totalDuration);
        stats.encryptionTimes.push(encryptionTime);
        stats.publishTimes.push(publishTime);
        stats.payloadSizes.push(payloadSize);
        stats.timestamps.push(Date.now());

        if ((index + 1) % 10 === 0 || index === 0) {
          console.log(
            `Message ${index + 1}/${numMessages} | ` +
            `Total: ${totalDuration}ms | ` +
            `Encrypt: ${encryptionTime}ms | ` +
            `Publish: ${publishTime}ms | ` +
            `Size: ${payloadSize}B`
          );
        }
      } catch (error) {
        console.error(`Error publishing message ${index}:`, error.message);
      }
    }

    await client.close();

    // Calculate comprehensive statistics
    const totalTime = Date.now() - totalStartTime;
    const successfulMessages = stats.totalDurations.length;

    // Helper function to calculate statistics
    const calcStats = (arr) => ({
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      min: Math.min(...arr),
      max: Math.max(...arr),
      median: arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)],
      p95: arr.sort((a, b) => a - b)[Math.floor(arr.length * 0.95)],
      p99: arr.sort((a, b) => a - b)[Math.floor(arr.length * 0.99)],
    });

    const totalStats = calcStats(stats.totalDurations);
    const encryptStats = calcStats(stats.encryptionTimes);
    const publishStats = calcStats(stats.publishTimes);
    const sizeStats = calcStats(stats.payloadSizes);

    // Calculate throughput and latency
    const throughput = (successfulMessages / (totalTime / 1000)).toFixed(2); // messages per second
    const avgLatency = totalStats.avg.toFixed(2); // average end-to-end latency

    // Calculate encryption overhead
    const encryptionOverhead = ((encryptStats.avg / totalStats.avg) * 100).toFixed(2);
    const publishOverhead = ((publishStats.avg / totalStats.avg) * 100).toFixed(2);

    console.log("\n" + "=".repeat(70));
    console.log("                    PERFORMANCE METRICS");
    console.log("=".repeat(70));
    
    console.log("\n📊 THROUGHPUT & LATENCY:");
    console.log(`  Messages Sent:        ${successfulMessages}/${numMessages}`);
    console.log(`  Total Time:           ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`  Throughput:           ${throughput} msg/s`);
    console.log(`  Avg Latency:          ${avgLatency}ms`);
    console.log(`  Median Latency:       ${totalStats.median.toFixed(2)}ms`);
    console.log(`  P95 Latency:          ${totalStats.p95.toFixed(2)}ms`);
    console.log(`  P99 Latency:          ${totalStats.p99.toFixed(2)}ms`);

    console.log("\n⏱️  TOTAL END-TO-END TIME:");
    console.log(`  Average:              ${totalStats.avg.toFixed(2)}ms`);
    console.log(`  Minimum:              ${totalStats.min}ms`);
    console.log(`  Maximum:              ${totalStats.max}ms`);

    console.log("\n🔐 ENCRYPTION TIME:");
    console.log(`  Average:              ${encryptStats.avg.toFixed(2)}ms`);
    console.log(`  Minimum:              ${encryptStats.min}ms`);
    console.log(`  Maximum:              ${encryptStats.max}ms`);
    console.log(`  Overhead:             ${encryptionOverhead}% of total time`);

    console.log("\n📤 PUBLISH/NETWORK TIME:");
    console.log(`  Average:              ${publishStats.avg.toFixed(2)}ms`);
    console.log(`  Minimum:              ${publishStats.min}ms`);
    console.log(`  Maximum:              ${publishStats.max}ms`);
    console.log(`  Overhead:             ${publishOverhead}% of total time`);

    console.log("\n📦 PAYLOAD SIZE:");
    console.log(`  Average:              ${sizeStats.avg.toFixed(0)} bytes`);
    console.log(`  Minimum:              ${sizeStats.min} bytes`);
    console.log(`  Maximum:              ${sizeStats.max} bytes`);

    console.log("\n📅 EXECUTION INFO:");
    console.log(`  Date:                 ${new Date().toLocaleString()}`);
    console.log(`  Message Name:         ${messageName}`);
    console.log(`  Client ID:            ${client.getClientPublicKey()}`);

    console.log("\n" + "=".repeat(70) + "\n");
  } catch (error) {
    console.error("Fatal error occurred:", error);
    if (error.cause) {
      console.error("Caused by:", error.cause);
    }
    process.exit(1);
  }
};

response();
