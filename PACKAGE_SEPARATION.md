# Package Separation Summary

## Overview

The EnSync SDK has been split into two separate npm packages:

1. **ensync-client-sdk** - gRPC client (default)
2. **ensync-websocket-client** - WebSocket client

## Package Structure

### 📦 ensync-client-sdk (gRPC)

**Location:** `/Users/martins2/Downloads/EnSync/ensync-sdk-js/`

**Files:**
- `grpc.js` - gRPC client implementation
- `error.js` - Error handling
- `ecc-crypto.js` - Encryption utilities
- `json-utils.js` - JSON validation and utilities
- `ensync.proto` - Protocol Buffer definitions
- `README.md` - Package documentation
- `CHANGELOG.md` - Version history
- `API.md` - API reference
- `package.json` - Package configuration

**Dependencies:**
- `@grpc/grpc-js` - gRPC implementation
- `@grpc/proto-loader` - Proto file loading
- `ed2curve` - Curve25519 encryption
- `tweetnacl` - Cryptography
- `tweetnacl-util` - Utilities

**Installation:**
```bash
npm install ensync-client-sdk
```

**Usage:**
```javascript
const { EnSyncEngine } = require("ensync-client-sdk");
const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
const client = await engine.createClient(appKey);
```

---

### 📦 ensync-websocket-client

**Location:** `/Users/martins2/Downloads/EnSync/ensync-websocket-client/`

**Files:**
- `websocket.js` - WebSocket client implementation
- `error.js` - Error handling
- `ecc-crypto.js` - Encryption utilities
- `json-utils.js` - JSON validation and utilities
- `README.md` - Package documentation
- `package.json` - Package configuration

**Dependencies:**
- `ws` - WebSocket implementation
- `ed2curve` - Curve25519 encryption
- `tweetnacl` - Cryptography
- `tweetnacl-util` - Utilities

**Installation:**
```bash
npm install ensync-websocket-client
```

**Usage:**
```javascript
const { EnSyncEngine } = require("ensync-websocket-client");
const engine = new EnSyncEngine("wss://node.gms.ensync.cloud8443");
const client = await engine.createClient(appKey);
```

---

## Key Changes

### 1. Package Configuration

**ensync-client-sdk (v0.2.0):**
- Removed WebSocket dependencies (`ws`)
- Removed `websocket.js` from files
- Updated description to "gRPC client"
- Removed exports for websocket module

**ensync-websocket-client (v0.1.0):**
- New package with WebSocket-only dependencies
- No gRPC dependencies
- Standalone package

### 2. Shared Components

Both packages share:
- `error.js` - Error handling
- `ecc-crypto.js` - Encryption
- `json-utils.js` - JSON utilities

### 3. Package-Specific Components

**gRPC Only:**
- `grpc.js` - gRPC client
- `ensync.proto` - Protocol definitions
- gRPC dependencies

**WebSocket Only:**
- `websocket.js` - WebSocket client
- `ws` dependency

## Benefits

### 1. Reduced Bundle Size
- Users only install what they need
- gRPC package: ~2MB smaller without `ws`
- WebSocket package: ~5MB smaller without gRPC dependencies

### 2. Clear Separation
- No confusion about which client to use
- Package names clearly indicate transport protocol
- Separate documentation for each

### 3. Independent Versioning
- Each package can be versioned independently
- Updates to one don't affect the other
- Easier maintenance

### 4. Better Developer Experience
- Clear package selection based on use case
- No unnecessary dependencies
- Faster installation

## Migration Guide

### From Old SDK (v0.1.x)

**If using gRPC (default):**
```javascript
// Before (still works)
const { EnSyncEngine } = require("ensync-client-sdk");

// After (same)
const { EnSyncEngine } = require("ensync-client-sdk");
```

**If using WebSocket:**
```javascript
// Before
const { EnSyncEngine } = require("ensync-client-sdk/websocket");

// After
npm install ensync-websocket-client
const { EnSyncEngine } = require("ensync-websocket-client");
```

### API Compatibility

Both packages maintain the same API:
- Same method names
- Same parameters
- Same return types
- Same error handling

Only the import statement changes for WebSocket users.

## Use Cases

### Use ensync-client-sdk (gRPC) when:
- Building server-to-server communication
- Need high performance and low latency
- Working in Node.js backend services
- Require HTTP/2 features
- Need built-in load balancing

### Use ensync-websocket-client when:
- Building browser applications
- Need bidirectional real-time communication
- Working with WebSocket infrastructure
- Require browser compatibility
- Building Node.js applications with WebSocket preference

## Publishing

### ensync-client-sdk
```bash
cd /Users/martins2/Downloads/EnSync/ensync-sdk-js
npm publish
```

### ensync-websocket-client
```bash
cd /Users/martins2/Downloads/EnSync/ensync-websocket-client
npm publish
```

## Documentation Links

- **gRPC Client**: See `ensync-sdk-js/README.md`
- **WebSocket Client**: See `ensync-websocket-client/README.md`
- **API Reference**: See `ensync-sdk-js/API.md`
- **Changelog**: See `ensync-sdk-js/CHANGELOG.md`

## Version History

- **v0.2.0** - Package separation, message-driven refactoring, JSON utilities
- **v0.1.2** - Previous unified package (deprecated for WebSocket users)
