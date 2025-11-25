// Test script for hybrid encryption in EnSync WebSocket client
require("dotenv").config();
const nacl = require("tweetnacl");
const naclUtil = require("tweetnacl-util");
const EnSyncEngine = require("../websocket.js").EnSyncEngine;

// Configuration
const WS_URL = process.env.ENSYNC_WS_URL || "ws://localhost:8080";
const ACCESS_KEY = process.env.ENSYNC_ACCESS_KEY || "test-access-key";
const EVENT_TO_PUBLISH = process.env.EVENT_TO_PUBLISH || "test-event";

// Generate test key pairs for recipients
function generateKeyPair() {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    secretKey: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

// Create test recipients
const recipients = [];
const recipientCount = 5;
for (let i = 0; i < recipientCount; i++) {
  recipients.push(generateKeyPair());
}

// Extract just the public keys for publishing
const recipientPublicKeys = recipients.map((r) => r.publicKey);

// Test message
const testMessage = {
  content: "This is a test message for hybrid encryption",
  timestamp: Date.now(),
  metadata: {
    source: "hybrid-ws-test",
    version: "1.0.0",
  },
};

// Test both encryption methods
async function runTests() {
  console.log("Starting EnSync WebSocket Hybrid Encryption Test");
  console.log(`Using ${recipientCount} recipients`);

  try {
    // Create EnSync client
    const client = new EnSyncEngine(WS_URL);
    await client.createClient(ACCESS_KEY);
    console.log("Connected to EnSync server");

    // Test 1: Traditional encryption
    console.log("\n1. Testing traditional encryption...");
    const traditionalResult = await client.publish(
      EVENT_TO_PUBLISH,
      recipientPublicKeys,
      testMessage,
      { persist: true, headers: { test: "traditional" } },
      { measurePerformance: true, useHybridEncryption: false }
    );

    console.log("Traditional encryption performance:");
    console.log(`- Total time: ${traditionalResult.performance.total}ms`);
    console.log(`- Encryption time: ${traditionalResult.performance.encryption.total}ms`);
    console.log(`- Network time: ${traditionalResult.performance.network.total}ms`);
    console.log(`- Encryption method: ${traditionalResult.performance.encryptionMethod}`);

    // Test 2: Hybrid encryption
    console.log("\n2. Testing hybrid encryption...");
    const hybridResult = await client.publish(
      EVENT_TO_PUBLISH,
      recipientPublicKeys,
      testMessage,
      { persist: true, headers: { test: "hybrid" } },
      { measurePerformance: true, useHybridEncryption: true }
    );

    console.log("Hybrid encryption performance:");
    console.log(`- Total time: ${hybridResult.performance.total}ms`);
    console.log(`- Encryption time: ${hybridResult.performance.encryption.total}ms`);
    console.log(`- Network time: ${hybridResult.performance.network.total}ms`);
    console.log(`- Encryption method: ${hybridResult.performance.encryptionMethod}`);

    // Compare results
    const traditionalEncryptionTime = traditionalResult.performance.encryption.total;
    const hybridEncryptionTime = hybridResult.performance.encryption.total;
    const improvement = (
      ((traditionalEncryptionTime - hybridEncryptionTime) / traditionalEncryptionTime) *
      100
    ).toFixed(2);

    console.log("\nPerformance Comparison:");
    console.log(`- Traditional encryption: ${traditionalEncryptionTime}ms`);
    console.log(`- Hybrid encryption: ${hybridEncryptionTime}ms`);
    console.log(`- Improvement: ${improvement}%`);

    // Test 3: Subscribe and verify decryption works
    console.log("\n3. Testing subscription and decryption...");

    // Create a promise that will be resolved when we receive a message
    const messageReceived = new Promise((resolve) => {
      // Subscribe to the test event
      client.subscribe(EVENT_TO_PUBLISH).then((subscription) => {
        console.log(`Subscribed to ${EVENT_TO_PUBLISH}`);

        // Add event handler
        subscription.on((event) => {
          console.log("Received event:");
          console.log(`- Event name: ${event.eventName}`);
          console.log(`- Event ID: ${event.idem}`);
          console.log(`- Payload successfully decrypted:`, !!event.payload);

          if (event.payload) {
            console.log(
              `- Payload content matches: ${event.payload.content === testMessage.content}`
            );
          }

          // Resolve the promise
          resolve(event);
        });

        // Publish a test message with hybrid encryption
        setTimeout(() => {
          console.log("Publishing test message with hybrid encryption...");
          client.publish(
            EVENT_TO_PUBLISH,
            [client.getClientPublicKey()], // Send to self
            testMessage,
            { persist: true, headers: { test: "self-test" } },
            { useHybridEncryption: true }
          );
        }, 1000);
      });
    });

    // Wait for the message to be received
    await messageReceived;

    // Close the connection
    await client.close();
    console.log("\nTest completed successfully");
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);
