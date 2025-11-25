# EnSync gRPC Client - API Reference

## Constructor

```javascript
new EnSyncEngine(url, options);
```

**Parameters:**

- `url` (string): gRPC server URL
  - Use `grpc://` for insecure connections (e.g., `grpc://localhost:50051`)
  - Use `grpcs://` for secure TLS connections (e.g., `grpcs://node.gms.ensync.cloud`)
  - Plain address defaults to insecure (e.g., `localhost:50051`)

- `options` (object):
  - `heartbeatInterval` (number): Heartbeat interval in ms (default: 30000)
  - `maxReconnectAttempts` (number): Max reconnect attempts (default: 5)
  - `enableLogging` (boolean): Enable console logs (default: false)

**Returns:** EnSyncEngine instance

## createClient(appKey, options)

Authenticates with the EnSync server.

**Parameters:**

- `appKey` (string): Your application key for authentication
- `options` (object):
  - `appSecretKey` (string): Secret key for message decryption

**Returns:** Promise\<EnSyncEngine\>

**Example:**

```javascript
const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
const client = await engine.createClient(appKey, {
  appSecretKey: secretKey,
});
```

## publish(messageName, recipients, payload, metadata, options)

Publishes a message to the EnSync system.

**Parameters:**

- `messageName` (string): Name of the message (e.g., "orders/created")
- `recipients` (string[]): Array of recipient public keys (base64 encoded)
- `payload` (object): Message payload (must be valid JSON)
- `metadata` (object): Message metadata
  - `persist` (boolean): Whether to persist the message
  - `headers` (object): Custom headers
- `options` (object):
  - `useHybridEncryption` (boolean): Use hybrid encryption (default: true)
  - `schema` (object): Optional JSON schema for validation

**Returns:** Promise\<string\> - Message IDs (comma-separated if multiple recipients)

**Example:**

```javascript
await client.publish(
  "orders/created",
  [recipientKey],
  { orderId: "123", amount: 99.99 },
  { persist: true, headers: { priority: "high" } },
  {
    schema: {
      orderId: "string",
      amount: "double",
    },
  }
);
```

## subscribe(messageName, options)

Subscribes to messages.

**Parameters:**

- `messageName` (string): Name of the message to subscribe to
- `options` (object):
  - `autoAck` (boolean): Automatically acknowledge messages (default: true)
  - `appSecretKey` (string): Secret key for decryption (overrides default)

**Returns:** Promise\<Subscription\>

**Example:**

```javascript
const subscription = await client.subscribe("orders/created", {
  autoAck: false,
  appSecretKey: customKey,
});
```

## Subscription Object

The subscription object returned by `subscribe()` provides the following methods:

### on(handler)

Register a message handler function.

**Parameters:**

- `handler` (function): Async function that receives message data

**Returns:** Function (unsubscribe function)

**Example:**

```javascript
subscription.on(async (message) => {
  console.log(message.messageName, message.payload);
  await subscription.ack(message.idem, message.block);
});
```

### ack(messageIdem, block)

Acknowledge a message.

**Parameters:**

- `messageIdem` (string): Message ID
- `block` (string): Block ID

**Returns:** Promise\<string\>

### defer(messageIdem, delayMs, reason)

Defer message processing.

**Parameters:**

- `messageIdem` (string): Message ID
- `delayMs` (number): Delay in milliseconds
- `reason` (string): Optional reason for deferring

**Returns:** Promise\<object\>

**Example:**

```javascript
await subscription.defer(message.idem, 5000, "Temporary error");
```

### discard(messageIdem, reason)

Permanently discard a message.

**Parameters:**

- `messageIdem` (string): Message ID
- `reason` (string): Optional reason for discarding

**Returns:** Promise\<object\>

### replay(messageIdem)

Replay a specific message.

**Parameters:**

- `messageIdem` (string): Message ID

**Returns:** Promise\<object\> - Message data

### pause(reason)

Pause message processing.

**Parameters:**

- `reason` (string): Optional reason for pausing

**Returns:** Promise\<object\>

### resume()

Resume message processing.

**Returns:** Promise\<object\>

### unsubscribe()

Unsubscribe from messages.

**Returns:** Promise\<void\>

## Message Structure

Messages received through subscription handlers have the following structure:

```javascript
{
  messageName: "orders/created",    // Message name
  idem: "msg-123",                  // Unique message ID
  block: "456",                     // Block ID
  timestamp: 1634567890123,         // Timestamp in milliseconds
  payload: { /* your data */ },     // Decrypted payload
  metadata: { /* metadata */ },     // Message metadata
  sender: "base64-key"              // Sender's public key
}
```

## Utility Methods

### getClientPublicKey()

Gets the client's public key (client hash).

**Returns:** string (base64 encoded)

### getPayloadByteSize(payload)

Gets the byte size of a payload.

**Parameters:**

- `payload` (object): The payload to measure

**Returns:** number

### getPayloadSkeleton(payload)

Gets the JSON schema of a payload.

**Parameters:**

- `payload` (object): The payload to analyze

**Returns:** object

### analyzePayload(payload)

Analyzes a payload and returns comprehensive metadata.

**Parameters:**

- `payload` (object): The payload to analyze

**Returns:** object with `byteSize`, `schema`, and `fieldCount`

### close()

Closes the gRPC connection.

**Returns:** Promise\<void\>

## JSON Utilities

The SDK includes comprehensive JSON utilities in `json-utils.js`:

### getJsonType(value)

Determines the JSON data type of a value.

**Returns:** string - One of: `string`, `integer`, `long`, `double`, `float`, `boolean`, `object`, `array`, `null`

### validateType(value, expectedType)

Validates if a value matches the expected type.

**Returns:** boolean

### validatePayloadSchema(payload, schema)

Validates a payload against a schema.

**Returns:** object with `success` and `errors` properties

### getPayloadSchema(payload, deep)

Extracts JSON schema from a payload.

**Returns:** object

### analyzePayload(payload)

Comprehensive payload analysis.

**Returns:** object with `byteSize`, `schema`, `fieldCount`, `isValid`

### isValidJson(value)

Checks if a value is valid JSON.

**Returns:** boolean

### safeJsonParse(jsonString, defaultValue)

Safely parses JSON with error handling.

**Returns:** parsed object or default value

## Error Types

The SDK throws `EnSyncError` with the following types:

- `EnSyncAuthError` - Authentication failures
- `EnSyncPublishError` - Publishing failures
- `EnSyncSubscriptionError` - Subscription failures
- `EnSyncValidationError` - Payload validation failures
- `EnSyncGenericError` - Other errors
- `EnSyncTimeoutError` - Timeout errors
- `EnSyncConnectionError` - Connection errors

**Example:**

```javascript
try {
  await client.publish(messageName, recipients, payload);
} catch (error) {
  if (error.name === "EnSyncValidationError") {
    console.error("Invalid payload:", error.message);
  }
}
```

## Data Types

The SDK supports the following JSON data types (matching EnSync engine):

- `string` - String values
- `integer` / `int` - 32-bit integers (-2,147,483,648 to 2,147,483,647)
- `long` - 64-bit integers
- `double` - Double precision floating point
- `float` - Single precision floating point
- `boolean` / `bool` - Boolean values
- `object` - JSON objects
- `array` - JSON arrays
- `null` - Null values
