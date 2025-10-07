# Node SDK

---

## Full Documentation

This is the client SDK for [EnSync engine](https://ensync.cloud) (event-delivery based integration engine) that enables you to integrate with third-party apps as though they were native to your system and in realtime.

See [Node SDK Documentation](https://docs.tryensync.com/node-sdk.html).

---

## Installation

```bash
npm install ensync-client-sdk
```

---

## Transport Options

The EnSync SDK supports two transport protocols:

- **gRPC (Default)** - High-performance binary protocol with HTTP/2, ideal for server-to-server communication
- **WebSocket** - Real-time bidirectional communication, great for browser and Node.js applications

### Using gRPC (Default)

```javascript
const { EnSyncEngine } = require('ensync-client-sdk');
// or explicitly
const { EnSyncEngine } = require('ensync-client-sdk/grpc');

// Non-authenticated connection
const client = new EnSyncEngine("grpc://localhost:50051");
await client.createClient(accessKey);

// Authenticated connection (TLS)
const secureClient = new EnSyncEngine("grpcs://node.ensync.cloud:50051");
await secureClient.createClient(accessKey);
```

### Using WebSocket

```javascript
const { EnSyncEngine } = require('ensync-client-sdk/websocket');

const client = new EnSyncEngine("ws://localhost:8082");
await client.createClient(accessKey);
```

---
