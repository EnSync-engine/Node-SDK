# EnSync WebSocket Client

A high-performance WebSocket client for the EnSync message-driven integration engine. This package provides real-time bidirectional communication with end-to-end encryption.

## Installation

```bash
npm install ensync-websocket-client
```

## Quick Start

```javascript
const { EnSyncEngine } = require("ensync-websocket-client");

async function main() {
  // Create WebSocket client
  const engine = new EnSyncEngine("wss://node.gms.ensync.cloud8443");
  const client = await engine.createClient(appKey, {
    appSecretKey: secretKey
  });

  // Publish a message
  await client.publish(
    "orders/created",
    [recipientKey],
    { orderId: "123", amount: 99.99 },
    { persist: true }
  );

  // Subscribe to messages
  const subscription = await client.subscribe("orders/created");
  subscription.on((message) => {
    console.log("Received:", message.payload);
    await subscription.ack(message.idem, message.block);
  });
}

main();
```

## Features

- **Real-time Communication**: WebSocket-based bidirectional messaging
- **End-to-End Encryption**: Ed25519 and hybrid encryption support
- **JSON-Oriented**: Built-in JSON validation and schema support
- **Message Management**: Acknowledge, defer, discard, and replay messages
- **Flow Control**: Pause and resume message delivery
- **Auto-Reconnection**: Automatic reconnection with configurable retry logic

## API Reference

### Constructor

```javascript
new EnSyncEngine(url, options)
```

**Parameters:**
- `url` (string): WebSocket URL (e.g., `wss://node.gms.ensync.cloud8443`)
- `options` (object):
  - `pingInterval` (number): Ping interval in ms (default: 30000)
  - `reconnectInterval` (number): Reconnect interval in ms (default: 5000)
  - `maxReconnectAttempts` (number): Max reconnect attempts (default: 5)
  - `enableLogging` (boolean): Enable console logs (default: false)

### createClient(appKey, options)

Authenticates with the EnSync server.

**Parameters:**
- `appKey` (string): Your application key
- `options` (object):
  - `appSecretKey` (string): Secret key for message decryption

**Returns:** Promise<EnSyncEngine>

### publish(messageName, recipients, payload, metadata, options)

Publishes a message to the EnSync system.

**Parameters:**
- `messageName` (string): Name of the message
- `recipients` (string[]): Array of recipient public keys (base64)
- `payload` (object): Message payload (must be valid JSON)
- `metadata` (object): Message metadata
  - `persist` (boolean): Whether to persist the message
  - `headers` (object): Custom headers
- `options` (object):
  - `useHybridEncryption` (boolean): Use hybrid encryption (default: true)
  - `schema` (object): Optional JSON schema for validation

**Returns:** Promise<string>

### subscribe(messageName, options)

Subscribes to messages.

**Parameters:**
- `messageName` (string): Name of the message to subscribe to
- `options` (object):
  - `autoAck` (boolean): Automatically acknowledge messages (default: true)
  - `appSecretKey` (string): Secret key for decryption

**Returns:** Promise<Subscription>

### Subscription Object

The subscription object provides:

- `on(handler)`: Register a message handler
- `ack(messageIdem, block)`: Acknowledge a message
- `defer(messageIdem, delayMs, reason)`: Defer message processing
- `discard(messageIdem, reason)`: Permanently discard a message
- `replay(messageIdem)`: Replay a specific message
- `pause(reason)`: Pause message processing
- `resume()`: Resume message processing
- `unsubscribe()`: Unsubscribe from messages

## Message Structure

```javascript
{
  messageName: "orders/created",
  idem: "msg-123",
  block: "456",
  timestamp: 1634567890123,
  payload: { /* your data */ },
  metadata: { /* metadata */ },
  sender: "base64-encoded-public-key"
}
```

## JSON Schema Validation

Validate payloads before publishing:

```javascript
await client.publish(
  "user/created",
  [recipientKey],
  { userId: "123", email: "user@example.com", age: 25 },
  { persist: true },
  {
    schema: {
      userId: "string",
      email: "string",
      age: "integer"
    }
  }
);
```

**Supported Types:**
- `string`, `integer`, `long`, `double`, `float`
- `boolean`, `object`, `array`, `null`

## Examples

### Publishing Messages

```javascript
const client = await engine.createClient(appKey);

await client.publish(
  "notifications/email",
  [recipientKey],
  {
    to: "user@example.com",
    subject: "Welcome!",
    body: "Thanks for signing up"
  },
  { persist: true, headers: { priority: "high" } }
);
```

### Subscribing with Manual Acknowledgment

```javascript
const subscription = await client.subscribe("payments/completed", {
  autoAck: false
});

subscription.on(async (message) => {
  try {
    await processPayment(message.payload);
    await subscription.ack(message.idem, message.block);
  } catch (error) {
    // Defer for retry
    await subscription.defer(message.idem, 5000, "Processing error");
  }
});
```

### Flow Control

```javascript
// Pause message delivery
await subscription.pause("Maintenance mode");

// Perform maintenance...

// Resume message delivery
await subscription.resume();
```

## Error Handling

```javascript
try {
  await client.publish(messageName, recipients, payload);
} catch (error) {
  if (error.name === "EnSyncValidationError") {
    console.error("Invalid payload:", error.message);
  } else if (error.name === "EnSyncPublishError") {
    console.error("Publish failed:", error.message);
  }
}
```

## Connection Management

```javascript
const engine = new EnSyncEngine("wss://node.gms.ensync.cloud8443", {
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  enableLogging: true
});

// Close connection
await client.close();
```

## Comparison with gRPC Client

| Feature | WebSocket | gRPC |
|---------|-----------|------|
| Protocol | WebSocket | HTTP/2 |
| Browser Support | Yes | Limited |
| Performance | Good | Better |
| Streaming | Bidirectional | Server streaming |
| Use Case | Browser/Node.js | Server-to-server |

For server-to-server communication, consider using the gRPC client: `ensync-client-sdk`

## License

ISC

## Links

- [EnSync Engine](https://ensync.cloud)
- [Documentation](https://docs.tryensync.com)
- [GitHub](https://github.com/EnSync-engine/Node-SDK)
- [gRPC Client](https://www.npmjs.com/package/ensync-client-sdk)
