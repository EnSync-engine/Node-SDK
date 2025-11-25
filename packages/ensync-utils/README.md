# EnSync Utils

Shared utilities for EnSync SDK packages. This package provides common functionality for encryption, error handling, and JSON validation used across all EnSync client implementations.

## Installation

```bash
npm install ensync-utils
```

## Features

- **Error Handling**: Standardized error types for EnSync operations
- **Encryption**: Ed25519 and hybrid encryption/decryption
- **JSON Validation**: Type checking and schema validation for payloads

## Usage

```javascript
const {
  EnSyncError,
  encryptEd25519,
  decryptEd25519,
  analyzePayload,
  validatePayloadSchema
} = require("ensync-utils");
```

## API Reference

### Error Handling

#### EnSyncError

Custom error class for EnSync operations.

```javascript
throw new EnSyncError("Authentication failed", "EnSyncAuthError");
```

**Error Types:**
- `EnSyncAuthError` - Authentication failures
- `EnSyncPublishError` - Publishing failures
- `EnSyncSubscriptionError` - Subscription failures
- `EnSyncValidationError` - Payload validation failures
- `EnSyncGenericError` - Other errors

### Encryption

#### encryptEd25519(payload, recipientPublicKey)

Encrypts a payload using Ed25519.

**Parameters:**
- `payload` (object): Data to encrypt
- `recipientPublicKey` (string): Base64 encoded public key

**Returns:** string (base64 encrypted payload)

#### decryptEd25519(encryptedPayload, secretKey)

Decrypts an Ed25519 encrypted payload.

**Parameters:**
- `encryptedPayload` (string): Base64 encrypted data
- `secretKey` (string): Base64 encoded secret key

**Returns:** string (decrypted JSON string)

#### hybridEncrypt(payload, recipientPublicKeys)

Encrypts payload using hybrid encryption (AES + Ed25519).

**Parameters:**
- `payload` (object): Data to encrypt
- `recipientPublicKeys` (string[]): Array of base64 public keys

**Returns:** object with `encryptedPayload` and `encryptedKeys`

#### hybridDecrypt(encryptedPayload, encryptedKey, secretKey)

Decrypts a hybrid encrypted payload.

**Parameters:**
- `encryptedPayload` (string): Encrypted data
- `encryptedKey` (string): Encrypted AES key
- `secretKey` (string): Base64 secret key

**Returns:** string (decrypted JSON string)

### JSON Utilities

#### getJsonType(value)

Determines the JSON data type of a value.

**Returns:** string - One of: `string`, `integer`, `long`, `double`, `float`, `boolean`, `object`, `array`, `null`

```javascript
getJsonType(123); // "integer"
getJsonType(123.45); // "double"
getJsonType("hello"); // "string"
```

#### validateType(value, expectedType)

Validates if a value matches the expected type.

```javascript
validateType(123, "integer"); // true
validateType("hello", "integer"); // false
```

#### validatePayloadSchema(payload, schema)

Validates a payload against a schema.

```javascript
const result = validatePayloadSchema(
  { userId: "123", age: 25 },
  { userId: "string", age: "integer" }
);
// { success: true, errors: [] }
```

#### getPayloadSchema(payload, deep)

Extracts JSON schema from a payload.

```javascript
getPayloadSchema({ name: "John", age: 30 });
// { name: "string", age: "integer" }
```

#### analyzePayload(payload)

Comprehensive payload analysis.

```javascript
analyzePayload({ orderId: "123", amount: 99.99 });
// {
//   byteSize: 35,
//   schema: { orderId: "string", amount: "double" },
//   fieldCount: 2,
//   isValid: true
// }
```

#### isValidJson(value)

Checks if a value can be JSON serialized.

```javascript
isValidJson({ name: "John" }); // true
isValidJson(undefined); // false
```

#### safeJsonParse(jsonString, defaultValue)

Safely parses JSON with error handling.

```javascript
safeJsonParse('{"name":"John"}', {}); // { name: "John" }
safeJsonParse('invalid', {}); // {}
```

## Data Types

Supported JSON data types (matching EnSync engine):

- `string` - String values
- `integer` / `int` - 32-bit integers (-2,147,483,648 to 2,147,483,647)
- `long` - 64-bit integers
- `double` - Double precision floating point
- `float` - Single precision floating point
- `boolean` / `bool` - Boolean values
- `object` - JSON objects
- `array` - JSON arrays
- `null` - Null values

## License

ISC

## Links

- [EnSync Engine](https://ensync.cloud)
- [gRPC Client](https://www.npmjs.com/package/ensync-client-sdk)
- [WebSocket Client](https://www.npmjs.com/package/ensync-websocket-client)
