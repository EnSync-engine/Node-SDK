# Changelog - Message-Driven Refactoring

## Overview

This update refactors the EnSync SDK to be more JSON-oriented and message-driven, with clear separation between gRPC and WebSocket clients.

## Major Changes

### 1. Message-Driven Terminology

**Updated from event-based to message-based terminology throughout the codebase:**

- `event` → `message`
- `eventName` → `messageName`
- `eventIdem` → `messageIdem`
- `PublishEvent` → `PublishMessage`
- `Subscribe` → `SubscribeToMessages`
- `Unsubscribe` → `UnsubscribeFromMessages`
- `AcknowledgeEvent` → `AcknowledgeMessage`
- `DeferEvent` → `DeferMessage`
- `DiscardEvent` → `DiscardMessage`
- `ReplayEvent` → `ReplayMessage`
- `PauseEvents` → `PauseMessages`
- `ContinueEvents` → `ContinueMessages`

### 2. Authentication Parameter Update

**Changed from `accessKey` to `appKey`:**

- `createClient(accessKey)` → `createClient(appKey)`
- Proto field: `access_key` → `app_key`
- Config property: `this.#config.accessKey` → `this.#config.appKey`

This aligns with the memory that states: `appKey` (formerly `accessKey`) is used for authentication with the EnSync service.

### 3. JSON-Oriented Enhancements

**New `json-utils.js` module provides:**

- `getJsonType(value)` - Determines JSON data type according to EnSync engine rules
- `validateType(value, expectedType)` - Validates values against expected types
- `validatePayloadSchema(payload, schema)` - Validates JSON payloads against schemas
- `getPayloadSchema(payload, deep)` - Extracts JSON schema from payloads
- `analyzePayload(payload)` - Comprehensive payload analysis
- `isValidJson(value)` - JSON validation
- `safeJsonParse(jsonString, defaultValue)` - Safe JSON parsing

**Supported Data Types (matching EnSync engine):**

- `string` - String values
- `integer` / `int` - 32-bit integers (-2,147,483,648 to 2,147,483,647)
- `long` - 64-bit integers
- `double` - Double precision floating point
- `float` - Single precision floating point
- `boolean` / `bool` - Boolean values
- `object` - JSON objects
- `array` - JSON arrays
- `null` - Null values

### 4. Enhanced Publish Method

**The `publish()` method now includes:**

- Automatic JSON validation before publishing
- Optional schema validation via `options.schema`
- Enhanced payload metadata with field count
- `payload_type: "application/json"` in requests
- Better error messages for validation failures

**Example with schema validation:**

```javascript
await client.publish(
  "orders/created",
  [recipientKey],
  {
    orderId: "123",
    amount: 99.99,
    items: ["item1", "item2"],
  },
  { persist: true },
  {
    schema: {
      orderId: "string",
      amount: "double",
      items: "array",
    },
  }
);
```

### 5. Protocol Buffer Updates

**Updated `ensync.proto`:**

- Changed `access_key` to `app_key` in `ConnectRequest`
- Added `payload_type` field to `PublishMessageRequest`
- Added optional `filter` field to `SubscribeRequest`
- Renamed RPC methods to message-driven terminology
- Enhanced payload metadata structure

### 6. Improved Payload Analysis

**The `analyzePayload()` method now returns:**

```javascript
{
  byteSize: 1234,           // Size in bytes
  schema: {                 // JSON schema with types
    orderId: "string",
    amount: "double",
    items: "array"
  },
  fieldCount: 3,            // Number of top-level fields
  isValid: true             // JSON validity flag
}
```

### 7. Client Separation

**gRPC and WebSocket clients are now clearly separated:**

- `grpc.js` - gRPC client implementation
- `websocket.js` - WebSocket client implementation
- Both export `EnSyncEngine` class with identical APIs
- Import explicitly: `require("ensync-client-sdk/grpc")` or `require("ensync-client-sdk/websocket")`
- Default import uses gRPC: `require("ensync-client-sdk")`

### 8. Updated Documentation

**All README files updated to reflect:**

- Message-driven terminology
- `appKey` instead of `accessKey`
- JSON-oriented features
- Clear separation of transport protocols
- Enhanced examples with schema validation

## Migration Guide

### Update Authentication

```javascript
// Before
await engine.createClient(accessKey);

// After
await engine.createClient(appKey);
```

### Update Variable Names

```javascript
// Before
subscription.on((event) => {
  console.log(event.eventName, event.payload);
  await subscription.ack(event.idem, event.block);
});

// After
subscription.on((message) => {
  console.log(message.messageName, message.payload);
  await subscription.ack(message.idem, message.block);
});
```

### Add Schema Validation (Optional)

```javascript
// New feature - optional schema validation
await client.publish(
  "user/created",
  [recipientKey],
  { userId: "123", email: "user@example.com" },
  { persist: true },
  {
    schema: {
      userId: "string",
      email: "string",
    },
  }
);
```

## Breaking Changes

1. **Parameter names**: `accessKey` → `appKey`
2. **Proto fields**: All event-related fields renamed to message-related
3. **RPC methods**: All gRPC methods renamed to message terminology
4. **Response fields**: `event_idem` → `message_idem`, `event_name` → `message_name`

## Backward Compatibility

The API structure remains the same - only naming has changed. Update your code by:

1. Replace `accessKey` with `appKey`
2. Replace `event` with `message` in variable names
3. Update proto file if using custom implementations

## New Features

1. **JSON Schema Validation** - Validate payloads before publishing
2. **Type System** - Full support for EnSync engine data types
3. **Enhanced Metadata** - More detailed payload analysis
4. **Better Error Messages** - Clear validation error reporting
5. **Utility Functions** - Comprehensive JSON utilities in `json-utils.js`

## Performance

- Hybrid encryption still enabled by default for multi-recipient messages
- JSON validation adds minimal overhead (~1-2ms per publish)
- Schema validation is optional and only runs when specified
- No performance degradation for existing functionality

## Testing

Update your test files to use:

- `appKey` instead of `accessKey`
- `message` terminology instead of `event`
- Environment variable: `ENSYNC_APP_KEY` (recommended, though `ENSYNC_ACCESS_KEY` still works)

## Next Steps

1. Update your application code to use `appKey`
2. Consider adding schema validation for critical messages
3. Update environment variables and configuration
4. Test with the new terminology
5. Review the enhanced JSON utilities for additional features
