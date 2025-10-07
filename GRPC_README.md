# EnSync gRPC Client

This document describes the gRPC implementation of the EnSync client SDK, which provides an alternative to the WebSocket-based client.

## Overview

The gRPC client (`grpc.js`) provides the same API as the WebSocket client (`websocket.js`) but uses gRPC for communication with the EnSync server. This offers several advantages:

- **Better performance** for high-throughput scenarios
- **Built-in load balancing** and connection management
- **Strongly-typed protocol** with Protocol Buffers
- **Bidirectional streaming** for efficient event delivery
- **Better error handling** with gRPC status codes

## Installation

First, install the required dependencies:

```bash
npm install
```

The gRPC dependencies are:
- `@grpc/grpc-js`: gRPC implementation for Node.js
- `@grpc/proto-loader`: Dynamic proto file loading

## Usage

### Importing the Client

```javascript
const { EnSyncEngine } = require('ensync-client-sdk/grpc');
```

### Creating a Client

```javascript
// Create gRPC client with insecure connection
const grpcEngine = new EnSyncEngine("grpc://localhost:50051", {
  heartbeatInterval: 15000, // 15 seconds
  maxReconnectAttempts: 3
});

// Create gRPC client with secure TLS connection
const secureEngine = new EnSyncEngine("grpcs://node.ensync.cloud:50051", {
  heartbeatInterval: 15000,
  maxReconnectAttempts: 3
});

// Authenticate
const client = await grpcEngine.createClient(accessKey, {
  appSecretKey: secretKey // Optional: for decryption
});
```

### Publishing Events

```javascript
await client.publish(
  eventName,
  [recipientPublicKey],
  {
    meter_per_seconds: 25,
    timestamp: new Date().toISOString()
  },
  { persist: true, headers: { source: 'my-app' } }
);
```

### Subscribing to Events

```javascript
const subscription = await client.subscribe(eventName, {
  autoAck: false,
  appSecretKey: secretKey
});

subscription.on(async (event) => {
  console.log('Received event:', event);
  
  // Process the event
  // ...
  
  // Acknowledge the event
  await subscription.ack(event.idem, event.block);
});
```

### Event Management

```javascript
// Defer an event (delay processing)
await subscription.defer(eventIdem, 5000, "Deferring for 5 seconds");

// Discard an event (permanently remove)
await subscription.discard(eventIdem, "Invalid data");

// Replay an event
const replayedEvent = await subscription.replay(eventIdem);

// Pause event processing
await subscription.pause("Maintenance mode");

// Resume event processing
await subscription.resume();
```

### Closing the Connection

```javascript
await subscription.unsubscribe();
await client.close();
```

## API Reference

### EnSyncEngine Constructor

```javascript
new EnSyncEngine(url, options)
```

**Parameters:**
- `url` (string): gRPC server URL
  - Use `grpc://` for insecure connections (e.g., `grpc://localhost:50051`)
  - Use `grpcs://` for secure TLS connections (e.g., `grpcs://node.ensync.cloud:50051`)
  - Plain address without scheme defaults to insecure (e.g., `localhost:50051`)
- `options` (object):
  - `heartbeatInterval` (number): Heartbeat interval in ms (default: 30000)
  - `maxReconnectAttempts` (number): Max reconnect attempts (default: 5)

### createClient(accessKey, options)

Authenticates with the EnSync server.

**Parameters:**
- `accessKey` (string): Access key for authentication
- `options` (object):
  - `appSecretKey` (string): Optional secret key for decryption

**Returns:** Promise<EnSyncEngine>

### publish(eventName, recipients, payload, metadata, options)

Publishes an event to the EnSync system.

**Parameters:**
- `eventName` (string): Name of the event
- `recipients` (string[]): Array of recipient public keys (base64 encoded)
- `payload` (object): Event payload
- `metadata` (object): Event metadata
  - `persist` (boolean): Whether to persist the event
  - `headers` (object): Additional headers
- `options` (object):
  - `useHybridEncryption` (boolean): Use hybrid encryption (default: true)

**Returns:** Promise<string>

### subscribe(eventName, options)

Subscribes to an event stream.

**Parameters:**
- `eventName` (string): Name of the event to subscribe to
- `options` (object):
  - `autoAck` (boolean): Automatically acknowledge events (default: true)
  - `appSecretKey` (string): Secret key for decryption

**Returns:** Promise<Subscription>

### Subscription Object

The subscription object provides the following methods:

- `on(handler)`: Register an event handler
- `ack(eventIdem, block)`: Acknowledge an event
- `defer(eventIdem, delayMs, reason)`: Defer event processing
- `discard(eventIdem, reason)`: Permanently discard an event
- `replay(eventIdem)`: Replay a specific event
- `pause(reason)`: Pause event processing
- `resume()`: Resume event processing
- `unsubscribe()`: Unsubscribe from the event

## Examples

### Producer Example

See `tests/grpc-producer.js` for a complete example:

```bash
node tests/grpc-producer.js
```

### Subscriber Example

See `tests/grpc-subscriber.js` for a complete example:

```bash
node tests/grpc-subscriber.js
```

## Protocol Buffer Definition

The gRPC service is defined in `ensync.proto`. Key services include:

- `Connect`: Authenticate with the server
- `Heartbeat`: Keep connection alive
- `PublishEvent`: Publish events
- `Subscribe`: Subscribe to event streams (server streaming)
- `AcknowledgeEvent`: Acknowledge event processing
- `DeferEvent`: Defer event processing
- `DiscardEvent`: Discard events
- `ReplayEvent`: Replay specific events
- `PauseEvents`: Pause event delivery
- `ContinueEvents`: Resume event delivery

## Comparison with WebSocket Client

| Feature | WebSocket | gRPC |
|---------|-----------|------|
| Connection Type | WebSocket | HTTP/2 |
| Protocol | Text-based | Binary (Protocol Buffers) |
| Streaming | Bidirectional | Server streaming |
| Performance | Good | Better for high throughput |
| Load Balancing | Manual | Built-in |
| Type Safety | Runtime | Compile-time (with proto) |
| Browser Support | Yes | Limited (gRPC-Web required) |

## Performance Considerations

1. **Hybrid Encryption**: For multi-recipient scenarios, hybrid encryption provides 2-5x better performance than standard encryption.

2. **Connection Pooling**: gRPC automatically manages connection pooling for better resource utilization.

3. **Heartbeat**: The client sends periodic heartbeats to maintain the connection. Adjust `heartbeatInterval` based on your network conditions.

4. **Streaming**: gRPC uses HTTP/2 streaming for efficient event delivery, reducing overhead compared to polling.

## Troubleshooting

### Connection Errors

If you encounter connection errors:
- Verify the gRPC server is running on the specified port
- Check firewall settings
- Ensure the server supports the gRPC protocol

### Authentication Failures

- Verify your access key is correct
- Check that the server is configured to accept gRPC connections
- Ensure the proto file matches the server's implementation

### Decryption Errors

- Verify the `appSecretKey` is correct
- Ensure the recipient public key matches your secret key
- Check that encryption is properly configured on the publisher side

## Migration from WebSocket

To migrate from the WebSocket client to gRPC:

1. Change the import:
   ```javascript
   // Before
   const { EnSyncEngine } = require('ensync-client-sdk');
   
   // After
   const { EnSyncEngine } = require('ensync-client-sdk/grpc');
   ```

2. Update the URL format:
   ```javascript
   // Before
   new EnSyncEngine("ws://localhost:8082")
   
   // After
   new EnSyncEngine("localhost:50051")
   ```

3. The API remains the same, so no other code changes are required!

## License

ISC
