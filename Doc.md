# Node SDK

---

## Full Documentation

This is the client SDK for [EnSync engine](https://ensync.cloud) - a high-performance message-driven integration engine that enables you to integrate with third-party apps as though they were native to your system and in realtime.

See [Documentation on EnSync Engine](https://docs.tryensync.com/introduction.html).  
See [Documentation on Our SDKs](https://docs.tryensync.com/sdk.html).

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
  - `enableLogging` (boolean): Enable/disable SDK console logs (default: false)

#### Events

- `error`: Emitted when an error occurs
- `connect`: Emitted when connection is established
- `disconnect`: Emitted when connection is closed

---

### Creating a Client

- Initialize the engine with your server URL
- Create a client with your app key

```javascript
const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
const client = await engine.createClient("your-app-key");
```

#### Client Parameters

- `appKey` (string): Your EnSync application key (formerly accessKey)
- `options` (object, optional):
  - `appSecretKey` (string): Application secret key for enhanced security
  - `clientId` (string): Custom client ID (default: auto-generated UUID)

#### Client Returns

Returns a new EnSyncClient instance

---

### Publishing Messages

```javascript
await client.publish(
  "orders/created", // Message name
  ["recipient-public-key"], // Recipients
  { orderId: "123", amount: 99.99 }, // Message payload (JSON)
  { persist: true } // Metadata
);
```

#### Publish Parameters

- `messageName` (string): Name of the message to publish
- `recipients` (array): Array of recipient public keys (base64)
- `payload` (object): Message data payload (must be valid JSON)
- `options` (object, optional):
  - `appSecretKey` (string): Application secret key
  - `ttl` (number): Time-to-live in seconds (default: 3600)

---

### Subscribing to Messages

```javascript
const subscription = await client.subscribe(messageName, options);
```

#### Subscribe Parameters

- `messageName` (string): Name of the message to subscribe to
- `options` (object, optional):
  - `appSecretKey` (string): Application secret key
  - `autoAck` (boolean): Automatically acknowledge events (default: true)
  - `fromTimestamp` (number): Subscribe from specific timestamp

#### Subscribe Returns

Returns a subscription object with the following methods:

```typescript
{
  on: (callback: (message: EnSyncMessage) => Promise<void>) => void;
  ack: (messageIdem: string, block: string) => Promise<string>;
  defer: (messageIdem: string, delayMs: number, reason: string) => Promise<object>;
  discard: (messageIdem: string, reason: string) => Promise<object>;
  replay: (messageIdem: string) => Promise<object>;
  pause: (reason: string) => Promise<object>;
  resume: () => Promise<object>;
  unsubscribe: () => Promise<void>;
}
```

---

### Message Structure

```javascript
{
  messageName: "orders/created",    // Message name
  idem: "msg-123",                  // Unique message ID
  block: "456",                     // Block ID for acknowledgment
  timestamp: 1634567890123,         // Message timestamp
  payload: { /* your data */ },     // Decrypted JSON payload
  metadata: { /* metadata */ },     // Message metadata
  sender: "base64-public-key"       // Sender's public key
}
```

---

### Closing Connections

```javascript
await client.destroy(stopEngine);
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

### Message Producer

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

const response = async () => {
  try {
    const messageName = "yourcompany/payment/POS/PAYMENT_SUCCESSFUL";
    const engine = new EnSyncEngine("grpc://localhost:50051");

    const client = await engine.createClient(appKey, {
      appSecretKey: secretKey
    });

    // Payload must be valid JSON
    await client.publish(
      messageName,
      [recipientPublicKey],
      {
        transactionId: "123",
        amount: 100,
        terminal: "pos-1",
        timestamp: Date.now(),
      },
      { persist: true }
    );

    await client.destroy();
  } catch (e) {
    console.error("Error:", e?.message);
  }
};
```

---

### Message Subscriber

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

const response = async () => {
  try {
    const messageName = "yourcompany/payment/POS/PAYMENT_SUCCESSFUL";
    const engine = new EnSyncEngine("grpc://localhost:50051");

    const client = await engine.createClient(appKey, {
      appSecretKey: secretKey
    });
    const subscription = await client.subscribe(messageName);

    subscription.on(async (message) => {
      try {
        // message is an EnSyncMessage
        console.log("Message Name:", message.messageName);
        console.log("Message ID:", message.idem);
        console.log("Message Block:", message.block);
        console.log("Message Payload:", message.payload); // Decrypted JSON payload
        console.log("Message Timestamp:", message.timestamp);

        await subscription.ack(message.idem, message.block);
        await subscription.unsubscribe();
      } catch (e) {
        console.error("Processing error:", e);
      }
    });
  } catch (e) {
    console.error("Error:", e?.message);
  }
};
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
const client = await engine.createClient(process.env.ENSYNC_APP_KEY, {
  appSecretKey: process.env.APP_SECRET_KEY
});

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

### Message Design

- Use hierarchical message names (e.g., `domain/entity/action`)
- Keep payloads concise and well-structured as valid JSON
- Consider versioning your message schemas
- Use JSON schema validation for critical messages

```javascript
// Good message naming pattern
await client.publish(
  "inventory/product/created",
  [recipientPublicKey],
  {
    productId: "prod-123",
    name: "Ergonomic Chair",
    sku: "ERG-CH-BLK",
    price: 299.99,
    createdAt: Date.now(),
  },
  { persist: true },
  {
    schema: {
      productId: "string",
      name: "string",
      sku: "string",
      price: "double",
      createdAt: "long"
    }
  }
);
```

### Security Best Practices

- Never hardcode app keys or secret keys
- Use environment variables or secure key management solutions
- All messages are end-to-end encrypted using Ed25519
- Hybrid encryption (AES + Ed25519) is used automatically for multi-recipient messages
- Use `appSecretKey` for message decryption

### Performance Optimization

- Batch messages when possible instead of sending many small messages
- Hybrid encryption is enabled by default for multi-recipient messages (improves performance 2-5x)
- Consider message size and frequency in high-volume scenarios
- Use message persistence (`persist: true`) for critical messages
- Implement proper error handling and retry logic with defer/replay
