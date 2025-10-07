import { check, sleep } from "k6";
import http from "k6/http";
import ws from "k6/ws";
import { Counter, Rate, Trend } from "k6/metrics";
import encoding from "k6/encoding";
import crypto from "k6/crypto";

// Custom metrics
const publishSuccesses = new Counter("publish_successes");
const publishFailures = new Counter("publish_failures");
const publishTime = new Trend("publish_time");
const publishRate = new Rate("publish_rate");
const messageSize = new Trend("message_size");
const hybridEncryptionTime = new Trend("hybrid_encryption_time");
const standardEncryptionTime = new Trend("standard_encryption_time");

// Configuration (override with environment variables)
const BASE_URL = __ENV.BASE_URL || "ws://localhost:8082";
const ACCESS_KEY = __ENV.ACCESS_KEY || "your-access-key-here";
const RECIPIENT_ID = __ENV.RECIPIENT_ID || "your-recipient-id-here";
const EVENT_NAME = __ENV.EVENT_NAME || "test-event";
const VUS = parseInt(__ENV.VUS || "10");
const DURATION = __ENV.DURATION || "1m";
const PUBLISH_PER_VU = parseInt(__ENV.PUBLISH_PER_VU || "100");
const PAYLOAD_SIZE = parseInt(__ENV.PAYLOAD_SIZE || "1024"); // in bytes
const USE_HYBRID = __ENV.USE_HYBRID === "true";
const TIMEOUT = parseInt(__ENV.TIMEOUT || "30000");
const PING_INTERVAL = parseInt(__ENV.PING_INTERVAL || "15000");
const RECIPIENTS_COUNT = parseInt(__ENV.RECIPIENTS_COUNT || "1");

// Test options
export const options = {
  scenarios: {
    publish_load: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
      gracefulStop: "10s",
    },
  },
  thresholds: {
    publish_failures: ["count<10"],
    publish_rate: ["rate>0.95"],
    publish_time: ["p(95)<1000"], // 95% of publishes should be under 1s
  },
};

// Generate a random payload of specified size
function generatePayload(size) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomData = new Array(size)
    .fill(0)
    .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
    .join("");

  return {
    timestamp: new Date().toISOString(),
    data: randomData,
    messageId: crypto.md5(randomData + Date.now(), "hex"),
    meter_per_seconds: Math.floor(Math.random() * 30),
    metadata: {
      test: true,
      size: size,
    },
  };
}

// Parse key-value response from EnSync
function parseKeyValueResponse(data) {
  const result = {};
  const content = data.replace("+PASS:", "");
  const items =
    content.startsWith("{") && content.endsWith("}")
      ? content.substring(1, content.length - 1).split(",")
      : content.split(",");

  items.forEach((item) => {
    const [key, value] = item.split("=");
    result[key.trim()] = value.trim();
  });

  return result;
}

// Simulate EnSync authentication
function authenticate(socket, accessKey) {
  return new Promise((resolve, reject) => {
    const authMessage = `CONN;ACCESS_KEY=:${accessKey}`;

    socket.send(authMessage);

    const timeout = setTimeout(() => {
      reject(new Error("Authentication timeout"));
    }, TIMEOUT);

    socket.on("message", (data) => {
      const message = data.toString();
      if (message.startsWith("+PASS:")) {
        clearTimeout(timeout);

        // Extract client ID and hash from response
        const clientInfo = parseKeyValueResponse(message);

        resolve({
          success: true,
          clientId: clientInfo.clientId,
          clientHash: clientInfo.clientHash,
        });
      } else if (message.startsWith("-FAIL:")) {
        clearTimeout(timeout);
        reject(new Error(`Authentication failed: ${message}`));
      }
    });
  });
}

// Simulate EnSync publish
function publishEvent(socket, clientId, eventName, recipients, payload, useHybrid = false) {
  return new Promise((resolve, reject) => {
    const publishStartTime = new Date();

    // In a real implementation, we would encrypt the payload here
    // For testing purposes, we'll just base64 encode it to simulate payload size
    const encodedPayload = encoding.b64encode(JSON.stringify(payload));
    messageSize.add(encodedPayload.length);

    // Simulate encryption time difference based on hybrid vs standard
    if (useHybrid) {
      const hybridStart = new Date();
      // Simulate hybrid encryption time (faster for multiple recipients)
      sleep(0.01 * recipients.length);
      hybridEncryptionTime.add(new Date() - hybridStart);
    } else {
      const standardStart = new Date();
      // Simulate standard encryption time (scales linearly with recipients)
      sleep(0.05 * recipients.length);
      standardEncryptionTime.add(new Date() - standardStart);
    }

    // Create an array of recipients for the test
    const recipientsList = Array(recipients.length).fill(recipients[0]);

    // Send publish message for each recipient
    const publishPromises = recipientsList.map((recipient) => {
      return new Promise((resolvePublish, rejectPublish) => {
        const metadata = JSON.stringify({
          persist: true,
          headers: { hybrid: useHybrid },
        });

        const publishMessage = `PUB;CLIENT_ID=:${clientId};EVENT_NAME=:${eventName};PAYLOAD=:${encodedPayload};DELIVERY_TO=:${recipient};METADATA=:${metadata}`;

        socket.send(publishMessage);

        const messageTimeout = setTimeout(() => {
          rejectPublish(new Error("Publish timeout"));
        }, TIMEOUT);

        const messageHandler = (data) => {
          const message = data.toString();
          if (message.startsWith("+PASS:")) {
            clearTimeout(messageTimeout);
            socket.off("message", messageHandler);
            resolvePublish();
          } else if (message.startsWith("-FAIL:")) {
            clearTimeout(messageTimeout);
            socket.off("message", messageHandler);
            rejectPublish(new Error(`Publish failed: ${message}`));
          }
        };

        socket.on("message", messageHandler);
      });
    });

    // Wait for all publishes to complete
    Promise.all(publishPromises)
      .then(() => {
        const publishDuration = new Date() - publishStartTime;
        publishTime.add(publishDuration);
        resolve({ success: true, duration: publishDuration });
      })
      .catch((error) => {
        reject(error);
      });
  });
}

// Main test function
export default function () {
  const url = `${BASE_URL}/message`;

  const params = {
    headers: {
      "Sec-WebSocket-Protocol": "ensync-protocol",
    },
  };

  const response = ws.connect(url, params, function (socket) {
    // Setup ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) {
        // OPEN
        socket.send("PING");
      }
    }, PING_INTERVAL);

    socket.on("open", async () => {
      try {
        // Authenticate
        const authResult = await authenticate(socket, ACCESS_KEY);

        if (!authResult.success) {
          console.error("Authentication failed");
          clearInterval(pingInterval);
          return;
        }

        const { clientId } = authResult;

        // Create recipient array based on configuration
        const recipients = Array(RECIPIENTS_COUNT).fill(RECIPIENT_ID);

        // Publish events
        for (let i = 0; i < PUBLISH_PER_VU; i++) {
          try {
            const payload = generatePayload(PAYLOAD_SIZE);
            const result = await publishEvent(
              socket,
              clientId,
              EVENT_NAME,
              recipients,
              payload,
              USE_HYBRID
            );

            check(result, {
              "Publish successful": (r) => r.success === true,
            });

            publishSuccesses.add(1);
            publishRate.add(1);

            // Small delay between publishes
            sleep(0.1);
          } catch (error) {
            console.error(`Publish error: ${error.message}`);
            publishFailures.add(1);
            publishRate.add(0);
          }
        }

        // Close connection gracefully
        clearInterval(pingInterval);
        socket.close();
      } catch (error) {
        console.error(`Test error: ${error.message}`);
        clearInterval(pingInterval);
        socket.close();
      }
    });

    socket.on("error", (e) => {
      console.error(`WebSocket error: ${e.error()}`);
      clearInterval(pingInterval);
    });

    // Handle ping/pong for connection keepalive
    socket.on("message", (data) => {
      const message = data.toString();
      if (message === "PING") {
        socket.send("PONG");
      }
    });
  });

  check(response, {
    "WebSocket connection established": (r) => r && r.status === 101,
  });

  sleep(1);
}
