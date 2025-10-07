import { check, sleep } from "k6";
import http from "k6/http";
import ws from "k6/ws";
import { Counter, Rate, Trend } from "k6/metrics";
import encoding from "k6/encoding";

// Custom metrics
const connectionFailures = new Counter("connection_failures");
const connectionSuccesses = new Counter("connection_successes");
const connectionTime = new Trend("connection_time");
const authenticationTime = new Trend("authentication_time");
const connectionRate = new Rate("connection_rate");

// Configuration (override with environment variables)
const BASE_URL = __ENV.BASE_URL || "ws://localhost:8082";
const ACCESS_KEY = __ENV.ACCESS_KEY || "your-access-key-here";
const RAMP_USERS = parseInt(__ENV.RAMP_USERS || "100");
const STEADY_USERS = parseInt(__ENV.STEADY_USERS || "500");
const RAMP_DURATION = __ENV.RAMP_DURATION || "30s";
const STEADY_DURATION = __ENV.STEADY_DURATION || "2m";
const TIMEOUT = parseInt(__ENV.TIMEOUT || "30000");
const PING_INTERVAL = parseInt(__ENV.PING_INTERVAL || "15000");

// Test options
export const options = {
  scenarios: {
    ramp_up: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP_DURATION, target: RAMP_USERS },
        { duration: STEADY_DURATION, target: STEADY_USERS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    connection_failures: ["count<10"],
    connection_rate: ["rate>0.95"],
    connection_time: ["p(95)<5000"],
    authentication_time: ["p(95)<3000"],
  },
};

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

// Helper function to simulate EnSync authentication
function authenticate(socket, accessKey) {
  return new Promise((resolve, reject) => {
    const authStartTime = new Date();
    const authMessage = `CONN;ACCESS_KEY=:${accessKey}`;

    socket.send(authMessage);

    const timeout = setTimeout(() => {
      reject(new Error("Authentication timeout"));
    }, TIMEOUT);

    socket.on("message", (data) => {
      const message = data.toString();
      if (message.startsWith("+PASS:")) {
        clearTimeout(timeout);
        const authTime = new Date() - authStartTime;
        authenticationTime.add(authTime);

        // Extract client ID and hash from response
        const clientInfo = parseKeyValueResponse(message);

        resolve({
          success: true,
          clientId: clientInfo.clientId,
          clientHash: clientInfo.clientHash,
          message,
        });
      } else if (message.startsWith("-FAIL:")) {
        clearTimeout(timeout);
        reject(new Error(`Authentication failed: ${message}`));
      }
    });
  });
}

// Main test function
export default function () {
  const connectionStartTime = new Date();

  // Format URL as per EnSync implementation
  const url = `${BASE_URL}/message`;

  const params = {
    headers: {
      "Sec-WebSocket-Protocol": "ensync-protocol",
    },
  };

  const response = ws.connect(url, params, function (socket) {
    connectionTime.add(new Date() - connectionStartTime);
    connectionSuccesses.add(1);
    connectionRate.add(1);

    // Setup ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) {
        // OPEN
        socket.send("PING");
      }
    }, PING_INTERVAL);

    socket.on("open", () => {
      console.log("WebSocket connection established");

      // Try to authenticate
      authenticate(socket, ACCESS_KEY)
        .then((result) => {
          check(result, {
            "Authentication successful": (r) => r.success === true,
          });

          // Keep the connection alive for a while
          sleep(5);

          // Close connection gracefully
          clearInterval(pingInterval);
          socket.close();
        })
        .catch((error) => {
          console.error(`Authentication error: ${error.message}`);
          connectionFailures.add(1);
          connectionRate.add(0);
          clearInterval(pingInterval);
          socket.close();
        });
    });

    socket.on("error", (e) => {
      console.error(`WebSocket error: ${e.error()}`);
      connectionFailures.add(1);
      connectionRate.add(0);
      clearInterval(pingInterval);
    });

    socket.on("close", () => {
      console.log("WebSocket connection closed");
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

  if (response.status !== 101) {
    connectionFailures.add(1);
    connectionRate.add(0);
  }

  sleep(1);
}
