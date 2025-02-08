# Node SDK

<hr id="header-separator" />

## Full Documentation

This is the client SDK for EnSync engine (event-delivery based integration engine) that enables you to integrate with third-party apps as though they were native to your system and in realtime.

See [Documentation on EnSync Engine](https://docs.tryensync.com/introduction.html).  
See [Documentation on Our SDKs](https://docs.tryensync.com/sdk.html).

<hr id="docs-separator" />

## Installation

```bash
npm install ensync-client-sdk
```

<hr id="installation-separator" />

## Usage

```javascript
import { EnSyncEngine, EnSyncError } from "ensync-client-sdk"
```

<hr id="usage-separator" />

## API Reference

### EnSyncEngine

The main class that manages connections and client creation for the EnSync system.

```javascript
const engine = new EnSyncEngine(url, options)
```

#### Parameters

- `url` (string): The URL of the EnSync server
- `options` (EnSyncEngineOptions):
  ```typescript
  {
    version?: string;     // API version to use (default: 'v1')
    disableTls?: boolean; // Whether to disable TLS verification (default: false)
    ignoreException?: boolean; // Whether to ignore exceptions (default: false)
    renewAt?: number;     // Time in milliseconds before client renewal (default: 420000)
  }
  ```

#### Events
- `error`: Emitted when an error occurs
- `connect`: Emitted when connection is established
- `disconnect`: Emitted when connection is closed

<hr id="engine-separator" />

### Client Creation

```javascript
const client = await engine.createClient(accessKey)
```

#### Parameters
- `accessKey` (string): The access key for authentication

#### Returns
Returns a new EnSyncClient instance

<hr id="client-creation-separator" />

### Publishing Events

```javascript
await client.publish(eventName, payload, metadata)
```

#### Parameters
- `eventName` (string): The name of the event to publish
- `payload` (any): User-defined data structure to be published
- `metadata` (EnSyncPublishOptions):
  ```typescript
  {
    persist?: boolean;    // Whether to persist the event (default: true)
    headers?: Object;     // Additional headers
  }
  ```

#### Example
```javascript
await client.publish('power-usage', {
  current: 100,
  unit: 'kWh',
  source: 'power-meter-1',
  timestamp: Date.now()
});
```

<hr id="publishing-separator" />

### Subscribing to Events

```javascript
const subscription = await client.subscribe(eventName)
```

#### Parameters
- `eventName` (string): The name of the event to subscribe to

#### Returns
Returns a subscription object with the following methods:
```typescript
{
  pull: (options: EnSyncSubscribeOptions, callback: (record: EnSyncEventPayload) => Promise<void>) => void;
  ack: (eventId: string, block: string) => Promise<string>;
  rollback: (eventId: string, block: string) => Promise<string>;
  stream: (options: EnSyncSubscribeOptions, callback: (record: EnSyncEventPayload) => Promise<void>) => void;
  unsubscribe: () => Promise<string>;
}
```

<hr id="subscribing-separator" />

### Received Event Structure (EnSyncEventPayload)
When receiving events through subscription callbacks, the events will have this structure:
```typescript
{
  id: string;         // Event identifier
  block: string;      // Block identifier
  name: string;       // Event name
  data: any;          // User-defined event data
  timestamp: number;  // Event timestamp
  header: Object;     // Additional header information
}
```

<hr id="event-structure-separator" />

### Closing Connections

```javascript
await client.destroy(stopEngine)
```

#### Parameters
- `stopEngine` (boolean, optional): If true, also closes the underlying engine connection. Set to false to keep the engine running for other clients. (default: false)

<hr id="closing-separator" />

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
    await client.publish(eventName, {
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

<hr id="producer-example-separator" />

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
    
    subscription.pull({ autoAck: false }, async (event) => {
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

<hr id="subscriber-example-separator" />

## Error Handling

The SDK throws `EnSyncError` for various error conditions. Always wrap your code in try-catch blocks to handle potential errors gracefully.

```javascript
try {
  // Your EnSync code
} catch (e) {
  if (e instanceof EnSyncError) {
    console.error("EnSync Error:", e.message);
  } else {
    console.error("Unexpected error:", e);
  }
}
