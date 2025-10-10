# Node SDK

---

## Full Documentation

This is the client [SDK](https://www.npmjs.com/package/ensync-client-sdk) for [EnSync engine](https://ensync.cloud) (message delivery engine) that enables you to build an ecosystem of connected devices and services.

---

## Installation

```bash
npm install ensync-client-sdk
```

---

## Usage

### Importing

#### Default (gRPC)

```javascript
// Import the default engine class (gRPC)
const { EnSyncEngine } = require('ensync-client-sdk');

// Production - uses secure TLS on port 443 by default
const engine = new EnSyncEngine("grpcs://node.ensync.cloud");

// Development - uses insecure connection on port 50051 by default
// const engine = new EnSyncEngine("localhost");

// Create authenticated client
const client = await engine.createClient("your-app-key");
```

#### WebSocket Alternative

```javascript
// Import the WebSocket engine class
const { EnSyncEngine } = require('ensync-client-sdk/websocket');

// Initialize WebSocket client
const engine = new EnSyncEngine("wss://node.ensync.cloud");
const client = await engine.createClient("your-app-key");
```

Both clients provide the same API for publishing and subscribing to events.

**gRPC Connection Options:**

- Production URLs automatically use secure TLS (port 443)
- `localhost` automatically uses insecure connection (port 50051)
- Explicit protocols: `grpcs://` (secure) or `grpc://` (insecure)
- Custom ports: `node.ensync.cloud:9090`

---

## API Reference

### EnSyncEngine (gRPC - Default)

The main class that manages gRPC connections and client creation for the EnSync system. This is the default and recommended client for production use.

### EnSyncWebSocketEngine (WebSocket - Alternative)

An alternative class that manages WebSocket connections and client creation for the EnSync system.

```javascript
const engine = new EnSyncEngine(url, options);
```

#### Parameters

| Parameter | Type     | Required | Description                      |
| --------- | -------- | -------- | -------------------------------- |
| `url`     | `string` | Yes      | The URL of the EnSync server     |
| `options` | `object` | No       | Configuration options            |

**Options Object:**

| Option                   | Type     | Default | Description                                |
| ------------------------ | -------- | ------- | ------------------------------------------ |
| `heartbeatInterval`      | `number` | `30000` | Heartbeat interval in ms (gRPC)            |
| `pingInterval`           | `number` | `30000` | Ping interval in ms (WebSocket)            |
| `reconnectInterval`      | `number` | `5000`  | Reconnection interval in ms                |
| `maxReconnectAttempts`   | `number` | `5`     | Maximum reconnection attempts              |

---

### Creating a Client

- Initialize the engine with your server URL
- Create a client with your app key

```javascript
// Initialize the engine (gRPC with TLS)
const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");

// Create a client
const client = await engine.createClient("your-app-key");
```

#### Client Creation Parameters

| Parameter | Type     | Required | Description                      |
| --------- | -------- | -------- | -------------------------------- |
| `appKey`  | `string` | Yes      | Your EnSync application key      |
| `options` | `object` | No       | Client configuration options     |

**Options Object:**

| Option          | Type     | Default | Description                                    |
| --------------- | -------- | ------- | ---------------------------------------------- |
| `appSecretKey`  | `string` | `null`  | Default key used to decrypt incoming messages  |

#### Client Returns

Returns a new `EnSyncClient` instance

---

### Publishing Events

```javascript
// Basic publish
await client.publish(
  "company/service/event-type", // Event name
  ["appId"], // Recipients (appIds of receiving parties)
  { data: "your payload" } // Event payload
);

// With optional parameters
await client.publish(
  "company/service/event-type",
  ["appId"], // The appId of the receiving party
  { data: "your payload" },
  { persist: true, headers: { source: "order-system" } }
);
```

#### Publish Parameters

| Parameter   | Type       | Required | Description                                              |
| ----------- | ---------- | -------- | -------------------------------------------------------- |
| `eventName` | `string`   | Yes      | Name of the event (e.g., "company/service/event-type")   |
| `recipients`| `string[]` | Yes      | Array of appIds (the appIds of receiving parties)        |
| `payload`   | `object`   | Yes      | Your event data (any JSON-serializable object)           |
| `metadata`  | `object`   | No       | Control event persistence and add custom headers         |

**Metadata Object:**

| Option    | Type      | Default | Description                                    |
| --------- | --------- | ------- | ---------------------------------------------- |
| `persist` | `boolean` | `false` | Whether to persist the event on the server     |
| `headers` | `object`  | `{}`    | Custom headers to include with the event       |

---

### Subscribing to Events

```javascript
// Basic subscription
const subscription = await client.subscribe("company/service/event-type");

// Set up event handler
subscription.on(async (event) => {
  console.log("Received event:", event.payload);
  // Process the event
});

// With options
const subscription = await client.subscribe("company/service/event-type", {
  autoAck: false,  // Manual acknowledgment
  appSecretKey: process.env.CUSTOM_DECRYPT_KEY  // Custom decryption key
});
```

#### Subscribe Parameters

| Parameter   | Type     | Required | Description                          |
| ----------- | -------- | -------- | ------------------------------------ |
| `eventName` | `string` | Yes      | Name of the event to subscribe to    |
| `options`   | `object` | No       | Subscription options                 |

**Options Object:**

| Option          | Type      | Default | Description                                    |
| --------------- | --------- | ------- | ---------------------------------------------- |
| `autoAck`       | `boolean` | `true`  | Set to false for manual acknowledgment        |
| `appSecretKey`  | `string`  | `null`  | Custom decryption key for this subscription    |

#### Subscription Methods

```javascript
// Handle incoming events
async function handleEvent(event) {
  // process event
}

subscription.on(handleEvent);

// Manually acknowledge an event
await subscription.ack(event.idem, event.block);

// Request a specific event to be replayed
const eventData = await subscription.replay("event-idem-123");

// Stop receiving events
await subscription.unsubscribe();
```

---

### Event Structure

When you receive an event through a subscription handler, it contains:

```javascript
{
  idem: "abc123",                // Unique event ID (use with ack/discard/replay)
  block: "456",                  // Block ID (use with ack)
  eventName: "company/service/event-type",  // Event name
  payload: { /* your data */ },  // Your decrypted data
  timestamp: 1634567890123,      // Event timestamp (milliseconds)
  metadata: {                    // Optional metadata
    headers: { /* custom headers */ }
  },
  sender: "base64-encoded-public-key"  // Sender's public key (or null)
}
```

---

### Closing Connections

```javascript
// Close just this client
await client.close();

// Close client and engine (if you have no other clients)
await client.close(true);
```

---

## Error Handling

The SDK throws `EnSyncError` for various error conditions. Always wrap your code in try-catch blocks to handle potential errors gracefully.

```javascript
try {
  // Your EnSync code
} catch (e) {
  if (e instanceof EnSyncError) {
    console.error("EnSync Error:", e.message);
    // Handle specific error types
    if (e.name === "EnSyncConnectionError") {
      // Handle connection errors
    } else if (e.name === "EnSyncPublishError") {
      // Handle publishing errors
    } else if (e.name === "EnSyncSubscriptionError") {
      // Handle subscription errors
    }
  } else {
    console.error("Unexpected error:", e);
  }
}
```

Common error types:

| Error Type                  | Description                          |
| --------------------------- | ------------------------------------ |
| `EnSyncConnectionError`     | Connection or authentication issues  |
| `EnSyncPublishError`        | Problems publishing events           |
| `EnSyncSubscriptionError`   | Subscription-related errors          |
| `EnSyncGenericError`        | Other errors                         |

---

## Complete Examples

### Quick Start (gRPC - Default)

```javascript
require("dotenv").config();
const { EnSyncEngine } = require("ensync-client-sdk");

async function quickStart() {
  try {
    // 1. Initialize engine and create client (gRPC by default)
    // Use grpc:// for insecure or grpcs:// for secure TLS connection
    const engine = new EnSyncEngine("grpc://localhost:50051");
    const client = await engine.createClient(process.env.ENSYNC_APP_KEY, {
      appSecretKey: process.env.ENSYNC_SECRET_KEY,
    });

    // 2. Publish an event
    await client.publish(
      "orders/status/updated",
      ["appId"], // The appId of the receiving party
      { orderId: "order-123", status: "completed" }
    );

    // 3. Subscribe to events
    const subscription = await client.subscribe("orders/status/updated");

    // 4. Handle incoming events
    subscription.on((event) => {
      console.log(`Received order update: ${event.payload.orderId} is ${event.payload.status}`);
      // Process event...
    });

    // 5. Clean up when done
    process.on("SIGINT", async () => {
      await subscription.unsubscribe();
      await client.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

quickStart();
```

> **Note:** This example uses environment variables for security. Create a `.env` file with:
> ```
> ENSYNC_APP_KEY=your_app_key_here
> ENSYNC_SECRET_KEY=your_secret_key_here
> ```

### Quick Start (WebSocket)

```javascript
require("dotenv").config();
const { EnSyncEngine } = require("ensync-client-sdk/websocket");

async function quickStart() {
  try {
    // 1. Initialize engine and create client (WebSocket)
    const engine = new EnSyncEngine("wss://node.ensync.cloud");
    const client = await engine.createClient(process.env.ENSYNC_APP_KEY, {
      appSecretKey: process.env.ENSYNC_SECRET_KEY,
    });

    // 2. Publish an event
    await client.publish(
      "orders/status/updated",
      ["appId"], // The appId of the receiving party
      { orderId: "order-123", status: "completed" }
    );

    // 3. Subscribe to events
    const subscription = await client.subscribe("orders/status/updated");

    // 4. Handle incoming events
    subscription.on((event) => {
      console.log(`Received order update: ${event.payload.orderId} is ${event.payload.status}`);
      // Process event...
    });

    // 5. Clean up when done
    process.on("SIGINT", async () => {
      await subscription.unsubscribe();
      await client.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

quickStart();
```

### Publishing Example

```javascript
// Create client
const engine = new EnSyncEngine("wss://node.ensync.cloud");
const client = await engine.createClient(process.env.ENSYNC_APP_KEY);

// Basic publish
const result = await client.publish(
  "notifications/email/sent",
  ["appId"], // The appId of the receiving party
  { to: "user@example.com", subject: "Welcome!" }
);

// With performance metrics
const resultWithMetrics = await client.publish(
  "notifications/email/sent",
  ["appId"], // The appId of the receiving party
  { to: "user@example.com", subject: "Welcome!" },
  { persist: true },
  { measurePerformance: true }
);

console.log(`Encryption took ${resultWithMetrics.performance.encryption.average}ms`);
console.log(`Network took ${resultWithMetrics.performance.network.average}ms`);
```

### Subscribing Example

```javascript
// Create client with decryption key
const client = await engine.createClient(process.env.ENSYNC_APP_KEY, {
  appSecretKey: process.env.ENSYNC_SECRET_KEY,
});

// Subscribe with manual acknowledgment
const subscription = await client.subscribe("payments/completed", { autoAck: false });

// Handle events
subscription.on(async (event) => {
  try {
    // Process the payment
    await updateOrderStatus(event.payload.orderId, "paid");

    // Get historical data if needed
    if (needsHistory(event.payload.orderId)) {
      const history = await subscription.replay(event.payload.previousEventId);
      console.log("Previous payment:", history);
    }

    // Acknowledge successful processing
    await subscription.ack(event.idem, event.block);
  } catch (error) {
    // Defer processing if temporary error
    if (isTemporaryError(error)) {
      await subscription.defer(event.idem, 60000, "Temporary processing error");
    } else {
      // Discard if permanent error
      await subscription.discard(event.idem, "Invalid payment data");
    }
  }
});
```

---

## Best Practices

### Connection Management

- Store connection credentials securely using environment variables
- Implement proper reconnection logic for production environments
- Always close connections when they're no longer needed

```javascript
// Using environment variables for sensitive keys
require("dotenv").config();

const engine = new EnSyncEngine(process.env.ENSYNC_URL);
const client = await engine.createClient(process.env.ENSYNC_APP_KEY);

// Implement proper error handling and reconnection
engine.on("disconnect", () => {
  console.log("Connection lost, will reconnect automatically");
});

// Close connections when done
process.on("SIGINT", async () => {
  await client.destroy(true);
  process.exit(0);
});
```

### Event Design

- Use hierarchical event names (e.g., `domain/entity/action`)
- Keep payloads concise and well-structured
- Consider versioning your event schemas

```javascript
// Good event naming pattern
await client.publish("inventory/product/created", ["warehouse-service"], {
  productId: "prod-123",
  name: "Ergonomic Chair",
  sku: "ERG-CH-BLK",
  price: 299.99,
  createdAt: Date.now(),
});
```

### Security Best Practices

- Never hardcode app keys or secret keys
- Use environment variables or secure key management solutions
- Implement proper authentication and authorization
- Consider encrypting sensitive payloads

### Performance Optimization

- Batch events when possible instead of sending many small messages
- Consider message size and frequency in high-volume scenarios
- Use appropriate TTL values for your use case
- Implement proper error handling and retry logic

### Subscription Control

The SDK provides methods to pause, continue, and replay events, which is useful for managing event processing flow.

#### What Pause and Continue Do

When you create a client using `engine.createClient()`, that client receives a unique `clientId`. This `clientId` (not the `appKey`) identifies your specific client instance on the EnSync server.

- **Pause**: Temporarily stops the client from receiving new events from the server. The subscription remains active on the server, but events are not delivered to this specific client instance. Other clients with the same `appKey` but different `clientId` will continue receiving events normally.

- **Continue**: Resumes event delivery to the paused client. Any events that occurred during the pause (depending on server settings and TTL) may be delivered once the subscription is continued.

#### Replaying Events

The replay command allows you to request a specific event to be sent again, even if it has already been processed. Unlike regular event handling which delivers events through the `.on` handler, the replay function returns the event data directly to your code. This is useful for:

- Retrieving specific events for analysis or debugging
- Accessing historical event data without setting up a handler
- Examining event content without processing it
- Getting event data synchronously in your code flow

```javascript
// Request a specific event to be replayed - returns data directly
const eventData = await subscription.replay("event-idem-123");
console.log("Event data:", eventData);

// You can immediately work with the event data
processEventData(eventData);
```

The replay command returns the complete event object with its payload:

```javascript
{
  eventName: "gms/ensync/third_party/payments/complete",
  idem: "event-idem-123",
  block: "81404",
  metadata: {
    persist: { isString: false, content: "true" },
    headers: {},
    $internal: {
      replay_info: {
        isReplayed: { isString: false, content: "true" },
        replayTimestamp: { isString: false, content: "1758410511179" },
        wasAcknowledged: { isString: false, content: "false" }
      }
    }
  },
  payload: { /* payload data */ },
  loggedAt: 1757778462158,
  recipient: "RECIPIENT_PUBLIC_KEY_BASE64",
  isGroup: false
}
```

**Direct Access vs Handler Processing:**

Regular event subscription:

```javascript
// Events come through the handler asynchronously
subscription.on((event) => {
  // Process event here
  console.log("Received event:", event);
});
```

Replay function:

```javascript
// Get event data directly and synchronously
const event = await subscription.replay("event-idem-123");
console.log("Retrieved event:", event);
```

#### Deferring Events

The defer method allows you to postpone processing of an event for a specified period. This is useful when:

- You need more time to prepare resources for processing
- You want to implement a retry mechanism with increasing delays
- You need to wait for another system to be ready
- You want to implement rate limiting for event processing

```javascript
// Defer an event for 5 seconds (5000ms)
const deferResult = await subscription.defer(
  "event-idem-123", // Event ID
  5000, // Delay in milliseconds
  "Waiting for resources to be available" // Optional reason
);
console.log("Defer result:", deferResult);

// Defer with minimum delay (immediate redelivery)
const immediateRedelivery = await subscription.defer("event-idem-123", 0);
```

The defer method returns an object with status information:

```javascript
{
  status: "success",
  action: "deferred",
  eventIdem: "event-idem-123",
  delayMs: 5000,
  scheduledDelivery: 1757778467158, // timestamp when event will be redelivered
  timestamp: 1757778462158
}
```

#### Discarding Events

The discard method allows you to permanently reject an event without processing it. This is useful when:

- The event contains invalid or corrupted data
- The event is no longer relevant or has expired
- The event was sent to the wrong recipient
- You want to implement a filtering mechanism

```javascript
// Discard an event permanently
const discardResult = await subscription.discard(
  "event-idem-123", // Event ID
  "Invalid data format" // Optional reason
);
console.log("Discard result:", discardResult);
```

The discard method returns an object with status information:

```javascript
{
  status: "success",
  action: "discarded",
  eventIdem: "event-idem-123",
  timestamp: 1757778462158
}
```

```javascript
// Create a subscription
const subscription = await client.subscribe("inventory/updates");

// Set up event handler
subscription.on(async (event) => {
  console.log(`Processing event: ${event.id}`);
  await processEvent(event);
});

// Pause the subscription when needed
// This will temporarily stop receiving events
await subscription.pause();
console.log("Subscription paused - no events will be received");

// Perform some operations while subscription is paused
await performMaintenance();

// Continue the subscription to resume receiving events
await subscription.continue();
console.log("Subscription continued - now receiving events again");

// Example: Implementing controlled processing with pause/continue
async function processInBatches(events) {
  // Pause subscription while processing a batch
  await subscription.pause();

  try {
    // Process events without receiving new ones
    for (const event of events) {
      await processEvent(event);
    }
  } catch (error) {
    console.error("Error processing batch:", error);
  } finally {
    // Always continue subscription when done
    await subscription.continue();
  }
}
```

Use cases for pause/continue:

- Temporary maintenance or system updates
- Rate limiting or throttling event processing
- Implementing backpressure mechanisms
- Batch processing of events

#### Implementation Details

- Pause/continue operations are performed at the subscription level, not the client level
- The server maintains the subscription state even when paused
- Pausing affects only the specific subscription instance, not all subscriptions for the client
- Events that arrive during a pause may be delivered when continued (depending on TTL settings)
- The pause state is not persisted across client restarts or reconnections
