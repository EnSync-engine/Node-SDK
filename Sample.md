# Node SDK

---

## Full Documentation

This is the client SDK for [EnSync engine](https://ensync.cloud) (message delivery engine) that enables you to build an ecosystem of connected devices and services.

---

## Installation

```bash
npm install ensync-client-sdk
```

---

## Usage

### Importing

```javascript
// CommonJS
const { EnSyncEngine } = require("ensync-client-sdk");

// ES Modules
import { EnSyncEngine } from "ensync-client-sdk";
```

---

## API Reference

### EnSyncEngine

The main class that manages connections and client creation for the EnSync system.

```javascript
const engine = new EnSyncEngine(url, options);
```

#### Parameters

- `url` (string): The URL of the EnSync server
- `options` (object, optional):
  - `disableTls` (boolean): Set to true to disable TLS (default: false)
  - `reconnectInterval` (number): Reconnection interval in ms (default: 5000)
  - `maxReconnectAttempts` (number): Maximum reconnection attempts (default: 10)

#### Events

- `error`: Emitted when an error occurs
- `connect`: Emitted when connection is established
- `disconnect`: Emitted when connection is closed

---

### Creating a Client

- Initialize the engine with your server URL
- Create a client with your app key

```javascript
const engine = new EnSyncEngine("https://node.gms.ensync.cloud");
const client = await engine.createClient("your-app-key");
```

#### Client Parameters

- `appKey` (string): Your EnSync application key
- `options` (object, optional):
  - `appSecretKey` (string): Default key used to decrypt incoming messages

#### Client Returns

Returns a new EnSyncClient instance

---

### Publishing Events

```javascript
await client.publish(
  "event/name",           // Event name
  ["recipient-id"],       // Recipients
  { data: "payload" },     // Event payload
  { persist: true, headers: {} }  // Metadata
);
```

#### Publish Parameters

- `eventName` (string): Name of the event to publish
- `recipients` (array): Array of recipient IDs
- `payload` (object): Event data payload
- `metadata` (object, optional): Event metadata
  - `persist` (boolean): Whether to persist the event (default: true)
  - `headers` (object): Custom headers for the event
- `options` (object, optional):
  - `ttl` (number): Time-to-live in seconds (default: 3600)

---

### Subscribing to Events

```javascript
const subscription = await client.subscribe(eventName, options);
```

#### Subscribe Parameters

- `eventName` (string): Name of the event to subscribe to
- `options` (object, optional):
  - `appSecretKey` (string): Optional separate key to decrypt messages (if different from the default key)
  - `autoAck` (boolean): Automatically acknowledge events (default: true)
  - `fromTimestamp` (number): Subscribe from specific timestamp

#### Subscribe Returns

Returns a subscription object with the following methods:

```typescript
{
  on: (callback: (record: EnSyncEventPayload) => Promise<void>) => void;
  ack: (eventId: string, block: string) => Promise<string>;
  rollback: (eventId: string, block: string) => Promise<string>;
  unsubscribe: () => Promise<string>;
}
```

---

### Event Structure

```javascript
{
  id: "event-id",                // Unique event ID
  block: "block-id",             // Block ID for acknowledgment
  data: { /* payload */ },       // User-defined payload
  timestamp: 1634567890123,      // Event timestamp
  metadata: {                    // Metadata object
    sender: "sender-id"          // Sender client ID (if available)
  },
  eventName: "event/name"        // Name of the event
}
```

---

### Closing Connections

```javascript
await client.destroy(stopEngine)
```

#### Destroy Parameters

- `stopEngine` (boolean, optional): If true, also closes the underlying engine connection. Set to false to keep the engine running for other clients. (default: false)

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

- `EnSyncConnectionError`: Connection or authentication issues
- `EnSyncPublishError`: Problems publishing events
- `EnSyncSubscriptionError`: Subscription-related errors
- `EnSyncGenericError`: Other errors

---

## Complete Examples

### Event Producer

Example of publishing events:

```javascript
// Load environment variables (recommended for sensitive keys)
require('dotenv').config();
const { EnSyncEngine } = require('ensync-client-sdk');

async function publishExample() {
  try {
    // Initialize the EnSync engine with connection options
    const engine = new EnSyncEngine("https://node.gms.ensync.cloud", {
      pingInterval: 15000, // 15 seconds
      reconnectInterval: 3000, // 3 seconds
      maxReconnectAttempts: 3
    });

    // Create a client using your app key
    const client = await engine.createClient(process.env.ENSYNC_APP_KEY);
    console.log('Successfully created and authenticated EnSync client');

    // Define event name and recipient(s)
    const eventName = "company/service/event-type";
    const recipients = ["recipient-public-key"];
    
    // Define the payload (any JSON-serializable object)
    const payload = {
      orderId: "order-123",
      status: "completed",
      timestamp: Date.now()
    };
    
    // Optional metadata
    const metadata = {
      persist: true,
      headers: { source: "order-system" }
    };

    // Publish the event
    const response = await client.publish(eventName, recipients, payload, metadata);
    console.log("Publish response:", response);
    
    // Close the connection when done
    await client.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

publishExample();
```

---

### Event Subscriber

Example of subscribing to events:

```javascript
// Load environment variables (recommended for sensitive keys)
require('dotenv').config();
const { EnSyncEngine } = require("ensync-client-sdk");

async function subscribeExample() {
  try {
    // Initialize the EnSync engine
    const engine = new EnSyncEngine("https://node.gms.ensync.cloud", { 
      disableTls: false,
      reconnectInterval: 5000,
      maxReconnectAttempts: 5
    });
    
    // Create a client with optional decryption key
    const client = await engine.createClient(
      process.env.ENSYNC_APP_KEY, 
      { appSecretKey: process.env.ENSYNC_SECRET_KEY }
    );

    // Subscribe to an event
    const eventName = "company/service/event-type";
    const subscription = await client.subscribe(eventName, { 
      autoAck: false, // Set to true for automatic acknowledgment
      appSecretKey: process.env.ENSYNC_SECRET_KEY // Optional separate key for this subscription
    });

    // Set up event handler
    subscription.on(async (event) => {
      try {
        console.log("Event received:", {
          id: event.idem,
          name: event.eventName,
          data: event.payload,
          timestamp: new Date(event.timestamp).toISOString()
        });
        
        // Process the event
        await processEvent(event);
        
        // Example: Pause subscription after processing an event
        if (shouldPauseProcessing(event)) {
          const pauseResult = await subscription.pause("Pausing for maintenance");
          console.log("Subscription paused:", pauseResult);
          
          // Continue after some time
          setTimeout(async () => {
            const continueResult = await subscription.continue();
            console.log("Subscription continued:", continueResult);
          }, 5000);
        }
        
        // Example: Defer an event that needs later processing
        if (needsDeferring(event)) {
          await subscription.defer(event.idem, 10000, "Resource not ready");
          return; // Skip acknowledgment as we're deferring
        }
        
        // Example: Discard invalid events
        if (isInvalidEvent(event)) {
          await subscription.discard(event.idem, "Invalid data format");
          return; // Skip acknowledgment as we're discarding
        }

        // Manually acknowledge the event when processed successfully
        await subscription.ack(event.idem, event.block);
      } catch (error) {
        console.error("Error processing event:", error);
      }
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Closing connection...');
      await subscription.unsubscribe();
      await client.close();
      process.exit(0);
    });
    
    // Example helper functions (implement these based on your needs)
    function processEvent(event) {
      // Process the event data
      return Promise.resolve();
    }
    
    function shouldPauseProcessing(event) {
      // Logic to determine if processing should be paused
      return false;
    }
    
    function needsDeferring(event) {
      // Logic to determine if event should be deferred
      return false;
    }
    
    function isInvalidEvent(event) {
      // Validation logic
      return false;
    }

  } catch (error) {
    console.error("Error:", error.message);
  }
}

subscribeExample();
```

---

## Best Practices

### Connection Management

- Store connection credentials securely using environment variables
- Implement proper reconnection logic for production environments
- Always close connections when they're no longer needed

```javascript
// Using environment variables for sensitive keys
require('dotenv').config();

const engine = new EnSyncEngine(process.env.ENSYNC_URL);
const client = await engine.createClient(process.env.ENSYNC_APP_KEY);

// Implement proper error handling and reconnection
engine.on('disconnect', () => {
  console.log('Connection lost, will reconnect automatically');
});

// Close connections when done
process.on('SIGINT', async () => {
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
await client.publish(
  "inventory/product/created",
  ["warehouse-service"],
  {
    productId: "prod-123",
    name: "Ergonomic Chair",
    sku: "ERG-CH-BLK",
    price: 299.99,
    createdAt: Date.now()
  }
);
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
subscription.on(event => {
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
  "event-idem-123",  // Event ID
  5000,               // Delay in milliseconds
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
  "event-idem-123",  // Event ID
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
