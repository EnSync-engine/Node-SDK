# EnSync SDK - API Examples

## Installation

```bash
npm install ensync-client-sdk
```

## Three Ways to Use the SDK

### 1. Builder Pattern (Recommended)

Fluent API for constructing and publishing messages:

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
const client = await engine.createClient(appKey, { appSecretKey });

// Publish with builder pattern
await client
  .message("orders/created") // Message name (created in EnSync UI)
  .to(recipientPublicKey) // Recipient's public key (base64)
  .withPayload({
    // JSON payload
    orderId: "123",
    amount: 99.99,
    items: ["item1", "item2"],
  })
  .persist() // Enable persistence
  .withHeaders({ source: "api" }) // Custom headers
  .withSchema({
    // Optional schema validation
    orderId: "string",
    amount: "double",
    items: "array",
  })
  .publish();
```

### 2. EventEmitter Pattern (Modern)

Subscribe using EventEmitter-style listeners:

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
const client = await engine.createClient(appKey, { appSecretKey });

// Listen for specific messages (no subscription object needed)
client.on("message:orders/created", (message) => {
  console.log("Order created:", message.payload);
  // message.messageName, message.idem, message.payload, etc.
});

// Subscribe to activate the listener
await client.subscribe("orders/created");

// You can also pass handler directly to subscribe
await client.subscribe("orders/created", (message) => {
  console.log("Received:", message.payload);
});
```

### 3. Legacy Pattern (Backward Compatible)

Traditional subscription object pattern:

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
const client = await engine.createClient(appKey, { appSecretKey });

// Legacy publish
await client.publish(
  "orders/created",
  [recipientPublicKey],
  { orderId: "123", amount: 99.99 },
  { persist: true, headers: { source: "api" } },
  { schema: { orderId: "string", amount: "double" } }
);

// Legacy subscribe with subscription object
const subscription = await client.subscribe("orders/created", {
  autoAck: false,
});

subscription.on(async (message) => {
  try {
    await processOrder(message.payload);
    await subscription.ack(message.idem, message.block);
  } catch (error) {
    await subscription.defer(message.idem, 5000, "Retry later");
  }
});
```

## Complete Examples

### Example 1: Order Processing System

```javascript
require("dotenv").config();
const { EnSyncEngine } = require("ensync-client-sdk");

async function orderProcessor() {
  const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
  const client = await engine.createClient(process.env.ENSYNC_APP_KEY, {
    appSecretKey: process.env.APP_SECRET_KEY,
  });

  // Publish order created message (builder pattern)
  const messageId = await client
    .message("orders/created")
    .to(process.env.WAREHOUSE_PUBLIC_KEY)
    .withPayload({
      orderId: "ORD-001",
      customerId: "CUST-123",
      items: [
        { sku: "ITEM-1", quantity: 2, price: 29.99 },
        { sku: "ITEM-2", quantity: 1, price: 49.99 },
      ],
      total: 109.97,
      createdAt: Date.now(),
    })
    .persist()
    .withHeaders({ source: "order-service", version: "1.0" })
    .withSchema({
      orderId: "string",
      customerId: "string",
      items: "array",
      total: "double",
      createdAt: "long",
    })
    .publish();

  console.log("Order published:", messageId);

  // Subscribe to order status updates (EventEmitter pattern)
  client.on("message:orders/status-updated", async (message) => {
    console.log(`Order ${message.payload.orderId} status: ${message.payload.status}`);

    if (message.payload.status === "shipped") {
      // Notify customer
      await notifyCustomer(message.payload);
    }
  });

  await client.subscribe("orders/status-updated");
}

orderProcessor().catch(console.error);
```

### Example 2: Payment Processing with Error Handling

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

async function paymentProcessor() {
  const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
  const client = await engine.createClient(appKey, { appSecretKey });

  // Subscribe with manual acknowledgment for critical operations
  const subscription = await client.subscribe("payments/process", {
    autoAck: false, // Manual ack for reliability
  });

  subscription.on(async (message) => {
    const { paymentId, amount, customerId } = message.payload;

    try {
      // Process payment
      const result = await processPayment(paymentId, amount);

      if (result.success) {
        // Acknowledge successful processing
        await subscription.ack(message.idem, message.block);

        // Publish payment completed message
        await client
          .message("payments/completed")
          .to(message.sender) // Reply to sender
          .withPayload({
            paymentId,
            transactionId: result.transactionId,
            status: "completed",
          })
          .persist()
          .publish();
      } else {
        // Defer for retry
        await subscription.defer(message.idem, 30000, "Payment gateway timeout");
      }
    } catch (error) {
      if (error.code === "INSUFFICIENT_FUNDS") {
        // Discard permanently
        await subscription.discard(message.idem, "Insufficient funds");
      } else {
        // Defer for retry
        await subscription.defer(message.idem, 60000, error.message);
      }
    }
  });
}

paymentProcessor().catch(console.error);
```

### Example 3: Real-time Notifications

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

async function notificationService() {
  const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud", {
    enableLogging: true, // Enable logs for debugging
  });

  const client = await engine.createClient(appKey, { appSecretKey });

  // Multiple message types with EventEmitter pattern
  client.on("message:notifications/email", async (message) => {
    await sendEmail(message.payload);
  });

  client.on("message:notifications/sms", async (message) => {
    await sendSMS(message.payload);
  });

  client.on("message:notifications/push", async (message) => {
    await sendPushNotification(message.payload);
  });

  // Error handling
  client.on("error", (error) => {
    console.error("EnSync error:", error);
  });

  // Subscribe to all notification types
  await Promise.all([
    client.subscribe("notifications/email"),
    client.subscribe("notifications/sms"),
    client.subscribe("notifications/push"),
  ]);

  console.log("Notification service ready");
}

notificationService().catch(console.error);
```

### Example 4: Flow Control (Pause/Resume)

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

async function batchProcessor() {
  const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
  const client = await engine.createClient(appKey, { appSecretKey });

  const subscription = await client.subscribe("data/import", {
    autoAck: false,
  });

  let messageQueue = [];
  const BATCH_SIZE = 100;

  subscription.on(async (message) => {
    messageQueue.push(message);

    if (messageQueue.length >= BATCH_SIZE) {
      // Pause to process batch
      await subscription.pause("Processing batch");

      try {
        await processBatch(messageQueue);

        // Acknowledge all messages in batch
        for (const msg of messageQueue) {
          await subscription.ack(msg.idem, msg.block);
        }

        messageQueue = [];
      } catch (error) {
        console.error("Batch processing failed:", error);
      } finally {
        // Resume message delivery
        await subscription.resume();
      }
    }
  });
}

batchProcessor().catch(console.error);
```

### Example 5: Multi-Recipient Broadcasting

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

async function broadcastAlert() {
  const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
  const client = await engine.createClient(appKey, { appSecretKey });

  const recipients = [
    "recipient1PublicKey",
    "recipient2PublicKey",
    "recipient3PublicKey",
    // ... more recipients
  ];

  // Hybrid encryption automatically used for multiple recipients (2-5x faster)
  await client
    .message("alerts/system-maintenance")
    .to(recipients) // Multiple recipients
    .withPayload({
      alertType: "maintenance",
      scheduledTime: Date.now() + 3600000, // 1 hour from now
      duration: 1800000, // 30 minutes
      message: "System maintenance scheduled",
    })
    .persist()
    .useHybridEncryption(true) // Explicitly enable (default: true)
    .publish();

  console.log(`Alert sent to ${recipients.length} recipients`);
}

broadcastAlert().catch(console.error);
```

## TypeScript Usage

```typescript
import { EnSyncEngine, EnSyncMessage, JsonSchema } from "ensync-client-sdk";

const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
const client = await engine.createClient(appKey, { appSecretKey });

// Type-safe message handling
client.on("message:orders/created", (message: EnSyncMessage) => {
  const { orderId, amount } = message.payload;
  console.log(`Order ${orderId}: $${amount}`);
});

await client.subscribe("orders/created");

// Type-safe schema
const orderSchema: JsonSchema = {
  orderId: "string",
  amount: "double",
  items: "array",
};

await client
  .message("orders/created")
  .to(recipientKey)
  .withPayload({ orderId: "123", amount: 99.99, items: [] })
  .withSchema(orderSchema)
  .publish();
```

## Best Practices

1. **Use Builder Pattern** for new code - it's more readable and maintainable
2. **Use EventEmitter Pattern** for multiple message types - cleaner than multiple subscriptions
3. **Enable Schema Validation** for critical messages to catch errors early
4. **Use Manual Ack** for operations that need reliability guarantees
5. **Hybrid Encryption** is enabled by default for multi-recipient messages (better performance)
6. **Message Names** are created in the EnSync UI - use the exact names
7. **Environment Variables** for sensitive keys - never hardcode credentials
