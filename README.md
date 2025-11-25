# EnSync Node.js SDK - Monorepo

The official Node.js SDK for [EnSync](https://ensync.cloud) - a high-performance message-driven integration engine.

## 🔗 Resources

- **Website**: [ensync.cloud](https://ensync.cloud)
- **Documentation**: [docs.ensync.cloud](https://docs.ensync.cloud/sdk/node)
- **GitHub**: [EnSync-engine/Node-SDK](https://github.com/EnSync-engine/Node-SDK)

## 📦 Packages

### 1. [ensync-client-sdk](./ensync-sdk-js) - gRPC Client
High-performance gRPC client for server-to-server communication.

```bash
npm install ensync-client-sdk
```

**Use when:**
- Building server-to-server communication
- Need high performance and low latency
- Working in Node.js backend services
- Require HTTP/2 features

### 2. [ensync-websocket-client](./ensync-websocket-client) - WebSocket Client
Real-time WebSocket client for bidirectional communication.

```bash
npm install ensync-websocket-client
```

**Use when:**
- Building browser applications
- Need bidirectional real-time communication
- Working with WebSocket infrastructure
- Require browser compatibility

### 3. [ensync-utils](./ensync-utils) - Shared Utilities
Shared utilities for encryption, error handling, and JSON validation.

```bash
npm install ensync-utils
```

**Includes:**
- Error handling (EnSyncError)
- Ed25519 and hybrid encryption
- JSON validation and type checking

## 🚀 Quick Start

### gRPC Client

```javascript
const { EnSyncEngine } = require("ensync-client-sdk");

const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
const client = await engine.createClient(appKey, {
  appSecretKey: secretKey
});

await client.publish("orders/created", [recipientKey], {
  orderId: "123",
  amount: 99.99
});
```

### WebSocket Client

```javascript
const { EnSyncEngine } = require("ensync-websocket-client");

const engine = new EnSyncEngine("wss://node.gms.ensync.cloud8443");
const client = await engine.createClient(appKey, {
  appSecretKey: secretKey
});

const subscription = await client.subscribe("orders/created");
subscription.on((message) => {
  console.log(message.payload);
});
```

## 🛠️ Development

### Local Setup

1. Clone the repository
2. Run the setup script:

```bash
./setup-local-dev.sh
```

This will:
- Install dependencies for all packages
- Link packages locally using npm link
- Setup the tests directory

### Running Tests

```bash
cd tests
node grpc-producer.js
node grpc-subscriber.js
node websocket-producer.js
node ws-subscriber.js
```

**Note:** Ensure your `.env` file in the tests directory has the correct credentials:

```env
ENSYNC_ACCESS_KEY=your_app_key_here
CLIENT_ACCESS_KEY=your_app_key_here
APP_SECRET_KEY=your_secret_key_here
EVENT_TO_PUBLISH=your/event/name
RECEIVER_IDENTIFICATION_NUMBER=recipient_public_key_base64
```

## 📤 Publishing

To publish all packages to npm:

```bash
./deploy-all.sh
```

This script will:
1. Check npm login status
2. Publish `ensync-utils` first (required by other packages)
3. Wait for npm registry to update
4. Publish `ensync-client-sdk` (gRPC)
5. Publish `ensync-websocket-client`

**Prerequisites:**
- Be logged in to npm: `npm login`
- Have publish permissions for the packages
- Update version numbers in package.json files before publishing

## 📁 Repository Structure

```text
ensync-sdk-js/
├── packages/
│   ├── ensync-client-sdk/      # gRPC client package
│   │   ├── grpc.js
│   │   ├── ensync.proto
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── CHANGELOG.md
│   │   └── API.md
│   │
│   ├── ensync-websocket-client/  # WebSocket client package
│   │   ├── websocket.js
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── ensync-utils/           # Shared utilities package
│       ├── error.js
│       ├── ecc-crypto.js
│       ├── json-utils.js
│       ├── index.js
│       ├── package.json
│       └── README.md
│
├── tests/                      # Shared test files
│   ├── grpc-producer.js
│   ├── grpc-subscriber.js
│   ├── websocket-producer.js
│   ├── ws-subscriber.js
│   └── .env
│
├── setup-local-dev.sh          # Local development setup
├── deploy-all.sh               # Deploy all packages to npm
├── PACKAGE_SEPARATION.md       # Package separation guide
└── README.md                   # This file
```

## 🔄 Recent Changes

### v0.2.0 - Message-Driven Refactoring

- **Terminology Update**: Changed from event-based to message-driven terminology
- **Authentication**: `accessKey` → `appKey`
- **JSON-Oriented**: Added JSON validation and schema support
- **Package Separation**: Split into three separate npm packages
- **Shared Utils**: Created `ensync-utils` for common functionality
- **Proto Updates**: Updated `.proto` file with message-driven naming

See [CHANGELOG.md](./ensync-sdk-js/CHANGELOG.md) for detailed changes.

## 📚 Documentation

- [gRPC Client README](./ensync-sdk-js/README.md)
- [gRPC API Reference](./ensync-sdk-js/API.md)
- [WebSocket Client README](./ensync-websocket-client/README.md)
- [Utils README](./ensync-utils/README.md)
- [Package Separation Guide](./PACKAGE_SEPARATION.md)
- [Changelog](./ensync-sdk-js/CHANGELOG.md)

## 🔗 Links

- **Website**: [ensync.cloud](https://ensync.cloud)
- **Documentation**: [docs.ensync.cloud](https://docs.ensync.cloud/sdk/node)
- **npm Packages**:
  - [ensync-client-sdk](https://www.npmjs.com/package/ensync-client-sdk)
  - [ensync-websocket-client](https://www.npmjs.com/package/ensync-websocket-client)
  - [ensync-utils](https://www.npmjs.com/package/ensync-utils)

## 📝 License

ISC

## 👥 Author

EnSync Team
