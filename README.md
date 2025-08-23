# Node SDK

---

## Full Documentation

This is the client SDK for [EnSync engine](https://ensync.cloud) (event-delivery based integration engine) that enables you to integrate with third-party apps as though they were native to your system and in realtime.

See [Documentation on EnSync Engine](https://docs.tryensync.com/introduction.html).  
See [Documentation on Our SDKs](https://docs.tryensync.com/node-sdk.html).

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
- Create a client with your access key

```javascript
const engine = new EnSyncEngine("https://node.gms.ensync.cloud");
const client = await engine.createClient("your-access-key");
```

#### Client Parameters

- `accessKey` (string): Your EnSync access key
- `options` (object, optional):
  - `appSecretKey` (string): Application secret key for enhanced security
  - `clientId` (string): Custom client ID (default: auto-generated UUID)

#### Client Returns

Returns a new EnSyncClient instance

---

### Publishing Events

```javascript
await client.publish(
  "event/name",           // Event name
  ["recipient-id"],       // Recipients
  { data: "payload" }     // Event payload
);
```

#### Publish Parameters

- `eventName` (string): Name of the event to publish
- `recipients` (array): Array of recipient IDs
- `payload` (object): Event data payload
- `options` (object, optional):
  - `appSecretKey` (string): Application secret key
  - `ttl` (number): Time-to-live in seconds (default: 3600)

---

### Subscribing to Events

```javascript
const subscription = await client.subscribe(eventName, options);
```

#### Subscribe Parameters

- `eventName` (string): Name of the event to subscribe to
- `options` (object, optional):
  - `appSecretKey` (string): Application secret key
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

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

const response = async () => {
  try {
    const eventName = "yourcompany/payment/POS/PAYMENT_SUCCESSFUL";
    const engine = new EnSyncEngine("https://localhost:8443", {
      disableTls: true
    });
    
    const client = await engine.createClient("your-access-key");
    
    // Payload is user-defined
    await client.publish(eventName, [
      "recipient-id"
    ], {
      transactionId: "123",
      amount: 100,
      terminal: "pos-1",
      timestamp: Date.now()
    });
    
    await client.destroy();
  } catch(e) {
    console.error("Error:", e?.message);
  }
}
```

---

### Event Subscriber

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

const response = async () => {
  try {
    const eventName = "yourcompany/payment/POS/PAYMENT_SUCCESSFUL";
    const engine = new EnSyncEngine("https://localhost:8443", {
      disableTls: true
    });
    
    const client = await engine.createClient("your-access-key");
    const subscription = await client.subscribe(eventName);
    
    subscription.on(async (event) => {
      try {
        // event is an EnSyncEventPayload
        console.log("Event ID:", event.id);
        console.log("Event Block:", event.block);
        console.log("Event Data:", event.data);  // Contains the user-defined payload
        console.log("Event Timestamp:", event.timestamp);
        
        await subscription.ack(event.id, event.block);
        await subscription.unsubscribe();
      } catch (e) {
        console.error("Processing error:", e);
      }
    });
  } catch(e) {
    console.error("Error:", e?.message);
  }
}
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
const client = await engine.createClient(process.env.ENSYNC_ACCESS_KEY);

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

- Never hardcode access keys or secret keys
- Use environment variables or secure key management solutions
- Implement proper authentication and authorization
- Consider encrypting sensitive payloads

### Performance Optimization

- Batch events when possible instead of sending many small messages
- Consider message size and frequency in high-volume scenarios
- Use appropriate TTL values for your use case
- Implement proper error handling and retry logic
