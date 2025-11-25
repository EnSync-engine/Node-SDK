# EnSync gRPC Client

A high-performance gRPC client for [EnSync](https://ensync.cloud) - a message-driven integration engine. This package provides server-to-server communication with HTTP/2, Protocol Buffers, and end-to-end encryption.

## 🔗 Resources

- **Website**: [ensync.cloud](https://ensync.cloud)
- **Documentation**: [docs.ensync.cloud](https://docs.ensync.cloud/sdk/node)
- **npm Package**: [ensync-client-sdk](https://www.npmjs.com/package/ensync-client-sdk)
- **GitHub**: [EnSync-engine/Node-SDK](https://github.com/EnSync-engine/Node-SDK)

## Installation

```bash
npm install ensync-client-sdk
```

## Quick Start

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

async function main() {
  // Create gRPC client (secure TLS connection)
  const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
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

- **High Performance**: HTTP/2 with Protocol Buffers for efficient binary communication
- **End-to-End Encryption**: Ed25519 and hybrid encryption support
- **JSON-Oriented**: Built-in JSON validation and schema support
- **Message Management**: Acknowledge, defer, discard, and replay messages
- **Flow Control**: Pause and resume message delivery
- **Streaming**: Efficient server-side streaming for real-time message delivery
- **Auto-Reconnection**: Built-in connection management with heartbeat

## Transport Options

For different use cases, EnSync provides two client packages:

- **ensync-client-sdk** (this package) - gRPC client for server-to-server communication
- **ensync-websocket-client** - WebSocket client for browser and Node.js applications

---
