# EnSync Client SDK Documentation

## Table of Contents
- [Introduction](#introduction)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
  - [EnSyncEngine](#ensyncengine)
  - [Subscription](#subscription)
  - [Publishing](#publishing)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Introduction

EnSync Client SDK is a powerful library for real-time event-based communication with the EnSync Engine. It provides a seamless way to integrate with third-party applications as though they were native to your system, all in real-time.

The SDK supports two transport protocols:
- **WebSocket** (default): For real-time bidirectional communication
- **HTTP/2**: For environments where WebSockets aren't available

## Installation

```bash
npm install ensync-client-sdk
```

### Import Options

```javascript
// Default import (WebSocket implementation)
const { EnSyncEngine } = require('ensync-client-sdk');

// HTTP implementation
const { EnSyncEngine } = require('ensync-client-sdk/http');
```

## Core Concepts

EnSync operates on a publish-subscribe pattern with these key concepts:

- **Engine**: The main connection manager that handles authentication and client creation
- **Client**: Handles event publishing and subscription
- **Events**: Named channels for message exchange
- **Subscription**: A connection to an event stream that receives messages
- **Publishing**: Sending messages to specific recipients through events

## Getting Started

### Creating a Client

```javascript
const { EnSyncEngine } = require('ensync-client-sdk');

async function connect() {
  // Create engine with WebSocket connection
  const engine = new EnSyncEngine("ws://your-ensync-server:8082", {
    pingInterval: 15000,  // 15 seconds
    reconnectInterval: 3000,  // 3 seconds
    maxReconnectAttempts: 3
  });
  
  // Create and authenticate client
  const client = await engine.createClient("YOUR_ACCESS_KEY");
  console.log("Successfully connected to EnSync");
  
  return client;
}
```

### Publishing Events

```javascript
async function publishEvent(client) {
  // Publish to specific recipients
  await client.publish(
    "your/event/name",  // Event name
    ["RECIPIENT_ID"],   // Array of recipient IDs
    {                   // Payload (any JSON-serializable object)
      temperature: 22.5,
      humidity: 45,
      timestamp: Date.now()
    }
  );
}
```

### Subscribing to Events

```javascript
async function subscribeToEvents(client) {
  // Subscribe to an event
  const subscription = await client.subscribe(
    "your/event/name",
    { appSecretKey: "YOUR_APP_SECRET_KEY" }
  );
  
  // Handle incoming events
  subscription.on(async (event) => {
    console.log("Received event:", event);
    
    // Acknowledge receipt (if autoAck is false)
    if (event.idem && event.block) {
      await subscription.ack(event.idem, event.block);
    }
  });
}
```

## API Reference

### EnSyncEngine

#### Constructor

```javascript
new EnSyncEngine(url, options)
```

- **url**: `string` - WebSocket URL of the EnSync server
- **options**: `Object`
  - **pingInterval**: `number` - Interval in ms for ping messages (default: 30000)
  - **reconnectInterval**: `number` - Interval in ms for reconnection attempts (default: 5000)
  - **maxReconnectAttempts**: `number` - Maximum reconnection attempts (default: 5)
  - **disableTls**: `boolean` - Whether to disable TLS verification (default: false)

#### Methods

##### createClient(accessKey, options)

Creates and authenticates a new client.

- **accessKey**: `string` - Access key for authentication
- **options**: `Object`
  - **appSecretKey**: `string` - Optional app secret key
- **Returns**: `Promise<EnSyncEngine>` - The authenticated client

##### close()

Closes the WebSocket connection and cleans up resources.

### Subscription

When you subscribe to an event, you receive a subscription object with these methods:

#### Methods

##### on(callback)

Sets up an event handler for incoming messages.

- **callback**: `Function(event)` - Function called when events are received

##### ack(eventIdem, block)

Acknowledges receipt of an event.

- **eventIdem**: `string` - Event identifier
- **block**: `string` - Block identifier
- **Returns**: `Promise<string>` - Acknowledgment response

##### rollback(eventIdem, block)

Rolls back an event (marks it as not processed).

- **eventIdem**: `string` - Event identifier
- **block**: `string` - Block identifier
- **Returns**: `Promise<string>` - Rollback response

##### unsubscribe()

Unsubscribes from the event.

- **Returns**: `Promise<string>` - Unsubscribe response

### Publishing

#### publish(eventName, recipients, payload, metadata)

Publishes an event to specific recipients.

- **eventName**: `string` - Name of the event
- **recipients**: `string[]` - Array of recipient identifiers
- **payload**: `Object` - Event data (any JSON-serializable object)
- **metadata**: `Object` - Optional metadata
  - **persist**: `boolean` - Whether to persist the event (default: true)
  - **headers**: `Object` - Additional headers
- **Returns**: `Promise<string>` - Publish response

## Error Handling

The SDK uses the `EnSyncError` class for all errors. You can catch and handle these errors as follows:

```javascript
try {
  await client.publish("event/name", ["recipient"], { data: "value" });
} catch (error) {
  if (error.name === "EnSyncPublishError") {
    console.error("Failed to publish event:", error.message);
  } else if (error.name === "EnSyncConnectionError") {
    console.error("Connection error:", error.message);
  } else {
    console.error("Unknown error:", error);
  }
}
```

Common error types:
- `EnSyncConnectionError`: Connection or authentication issues
- `EnSyncPublishError`: Problems publishing events
- `EnSyncSubscriptionError`: Subscription-related errors
- `EnSyncGenericError`: Other errors

## Examples

### Real-time Data Streaming

```javascript
// Producer
async function streamSensorData(client, sensorId) {
  setInterval(async () => {
    try {
      await client.publish("sensors/readings", ["CONTROL_CENTER_ID"], {
        sensorId,
        temperature: Math.random() * 30,
        humidity: Math.floor(Math.random() * 100),
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("Failed to publish sensor data:", error);
    }
  }, 5000);
}

// Consumer
async function monitorSensors(client) {
  const subscription = await client.subscribe("sensors/readings", { 
    appSecretKey: process.env.APP_SECRET_KEY 
  });
  
  subscription.on(async (event) => {
    console.log(`Sensor ${event.payload.sensorId}: ${event.payload.temperature}°C, ${event.payload.humidity}%`);
    
    // Process data and acknowledge
    await subscription.ack(event.idem, event.block);
  });
}
```

### Secure Communication

```javascript
// Using environment variables for sensitive keys
require('dotenv').config();

const engine = new EnSyncEngine(process.env.ENSYNC_URL);
const client = await engine.createClient(process.env.ENSYNC_ACCESS_KEY);

// Publish with encrypted payload (encryption handled by SDK)
await client.publish(
  "secure/messages",
  [process.env.RECIPIENT_ID],
  {
    message: "This content is automatically encrypted",
    timestamp: Date.now()
  }
);
```

## Best Practices

1. **Connection Management**
   - Store connection credentials securely using environment variables
   - Implement proper reconnection logic for production environments

2. **Event Design**
   - Use hierarchical event names (e.g., `domain/entity/action`)
   - Keep payloads concise and well-structured

3. **Error Handling**
   - Always wrap SDK calls in try/catch blocks
   - Implement exponential backoff for retries

4. **Security**
   - Never hardcode access keys or secret keys
   - Use environment variables or secure key management solutions

5. **Performance**
   - Batch events when possible instead of sending many small messages
   - Consider message size and frequency in high-volume scenarios
