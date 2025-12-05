const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const EventEmitter = require("events");
const naclUtil = require("tweetnacl-util");
const {
  EnSyncError,
  GENERIC_MESSAGE,
  encryptEd25519,
  decryptEd25519,
  hybridEncrypt,
  hybridDecrypt,
  decryptMessageKey,
  decryptWithMessageKey,
  analyzePayload,
  validatePayloadSchema,
  getPayloadSchema,
  isValidJson,
} = require("ensync-utils");
const { MessageBuilder } = require("./message-builder");

const SERVICE_NAME = "EnSync:";
const PROTO_PATH = path.join(__dirname, "ensync.proto");

// Load proto file
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const ensyncProto = grpc.loadPackageDefinition(packageDefinition).ensync;

class EnSyncEngine extends EventEmitter {
  /** @type {Object} */
  #client = null;

  /** @type {Object} */
  #config = {
    url: null,
    appKey: null,
    clientId: null,
    clientHash: null,
    appSecretKey: null,
    heartbeatInterval: 30000, // 30 seconds
    maxReconnectAttempts: 5,
    enableLogging: false, // Enable/disable console logs
  };

  /** @type {Object} */
  #state = {
    isConnected: false,
    isAuthenticated: false,
    reconnectAttempts: 0,
    heartbeatTimeout: null,
    shouldReconnect: true,
  };

  /** @type {Map<string, Object>} */
  #subscriptions = new Map();

  /** @type {Map<string, Set<Function>>} */
  #messageHandlers = new Map();

  /** @type {Object|null} Shared multiplexed subscription stream */
  #subscriptionStream = null;

  /**
   * Creates a new EnSync gRPC client
   * @param {string} url - gRPC server URL (e.g., "grpc://localhost:50051" or "grpcs://node.gms.ensync.cloud")
   * @param {Object} options - Configuration options
   * @param {number} [options.heartbeatInterval] - Heartbeat interval in ms (default: 30000)
   * @param {number} [options.maxReconnectAttempts] - Max reconnect attempts (default: 5)
   * @param {boolean} [options.enableLogging=false] - Enable/disable console logs (default: false)
   */
  constructor(url, options = {}) {
    super();

    // Parse URL to determine if secure connection is needed
    let serverAddress = url;
    let useSecure = false;

    if (url.startsWith("grpcs://")) {
      serverAddress = url.replace("grpcs://", "");
      useSecure = true;
    } else if (url.startsWith("grpc://")) {
      serverAddress = url.replace("grpc://", "");
      useSecure = false;
    }
    // If no scheme provided, assume insecure for backward compatibility

    this.#config.url = serverAddress;
    if (options.heartbeatInterval) this.#config.heartbeatInterval = options.heartbeatInterval;
    if (options.maxReconnectAttempts)
      this.#config.maxReconnectAttempts = options.maxReconnectAttempts;
    if (options.enableLogging !== undefined) this.#config.enableLogging = options.enableLogging;

    // Create gRPC client with appropriate credentials
    const credentials = useSecure
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();

    this.#client = new ensyncProto.EnSyncService(serverAddress, credentials);
  }

  /**
   * Creates a new gRPC client and authenticates
   * @param {string} appKey - The app key for authentication
   * @param {Object} options - Additional options
   * @param {string} [options.appSecretKey] - App secret key for decryption
   * @returns {Promise<EnSyncEngine>} A new EnSync gRPC client instance
   * @throws {EnSyncError} If client creation fails
   */
  async createClient(appKey, options = {}) {
    this.#config.appKey = appKey;
    if (options.appSecretKey) this.#config.appSecretKey = options.appSecretKey;
    await this.#authenticate();
    return this;
  }

  /**
   * Creates a message builder for fluent API
   * @param {string} messageName - Name of the message (created in EnSync UI)
   * @returns {MessageBuilder} Message builder instance
   */
  message(messageName) {
    return new MessageBuilder(this, messageName);
  }

  /**
   * Publishes a message to the EnSync system (legacy method)
   * @param {string} messageName - Name of the message
   * @param {string[]} recipients - Array of base64 encoded public keys of recipients
   * @param {Object} payload - Message payload (must be valid JSON)
   * @param {Object} metadata - Message metadata
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.useHybridEncryption=true] - Whether to use hybrid encryption (default: true)
   * @param {Object} [options.schema] - Optional JSON schema for payload validation
   * @returns {Promise<string>} Server response
   * @throws {EnSyncError} If publishing fails
   */
  async publish(
    messageName,
    recipients = [],
    payload = {},
    metadata = { persist: true, headers: {} },
    options = {}
  ) {
    return this._publishInternal(messageName, recipients, payload, metadata, options);
  }

  /**
   * Internal publish method used by both legacy and builder APIs
   * @private
   */
  async _publishInternal(
    messageName,
    recipients = [],
    payload = {},
    metadata = { persist: true, headers: {} },
    options = {}
  ) {
    if (!this.#state.isAuthenticated) {
      throw new EnSyncError("Not authenticated", "EnSyncAuthError");
    }

    if (!Array.isArray(recipients)) {
      throw new EnSyncError("recipients must be an array", "EnSyncAuthError");
    }

    if (recipients.length === 0) {
      throw new EnSyncError("recipients array cannot be empty", "EnSyncAuthError");
    }

    // Validate payload is valid JSON
    if (!isValidJson(payload)) {
      throw new EnSyncError("Payload must be valid JSON", "EnSyncValidationError");
    }

    // Validate against schema if provided
    if (options.schema) {
      const validation = validatePayloadSchema(payload, options.schema);
      if (!validation.success) {
        throw new EnSyncError(
          `Payload validation failed: ${validation.errors.join(", ")}`,
          "EnSyncValidationError"
        );
      }
    }

    const useHybridEncryption = options.useHybridEncryption !== false; // Default to true

    // Calculate payload metadata with JSON schema
    const payloadMetadata = analyzePayload(payload);
    const payloadMetadataString = JSON.stringify({
      byte_size: payloadMetadata.byteSize,
      skeleton: payloadMetadata.schema,
      field_count: payloadMetadata.fieldCount,
    });

    try {
      const responses = [];
      let encryptedPayloads = [];

      // Only use hybrid encryption when there are multiple recipients
      if (useHybridEncryption && recipients.length > 1) {
        // Use hybrid encryption (one encryption for all recipients)
        const { encryptedPayload, encryptedKeys } = hybridEncrypt(
          JSON.stringify(payload),
          recipients
        );

        // Format for transmission: combine encrypted payload and keys
        const hybridMessage = {
          type: "hybrid",
          payload: encryptedPayload,
          keys: encryptedKeys,
        };

        const encryptedBase64 = naclUtil.encodeBase64(Buffer.from(JSON.stringify(hybridMessage)));

        // Create one encrypted payload for all recipients
        encryptedPayloads = recipients.map((recipient) => ({
          recipient,
          encryptedBase64,
        }));
      } else {
        // Use traditional encryption (separate encryption for each recipient)
        encryptedPayloads = recipients.map((recipient) => {
          const encrypted = encryptEd25519(
            JSON.stringify(payload),
            naclUtil.decodeBase64(recipient)
          );
          const encryptedBase64 = naclUtil.encodeBase64(Buffer.from(JSON.stringify(encrypted)));
          return {
            recipient,
            encryptedBase64,
          };
        });
      }

      // Send messages to all recipients
      for (const { recipient, encryptedBase64 } of encryptedPayloads) {
        const request = {
          client_id: this.#config.clientId,
          message_name: messageName,
          payload: encryptedBase64,
          delivery_to: recipient,
          metadata: JSON.stringify(metadata),
          payload_metadata: payloadMetadataString,
          payload_type: "application/json",
        };

        const response = await this.#publishMessage(request);
        responses.push(response.message_idem);
      }

      return responses.join(",");
    } catch (error) {
      throw new EnSyncError(error, "EnSyncPublishError");
    }
  }

  /**
   * Subscribes to messages (EventEmitter-style)
   * @param {string} messageName - Name of the message to subscribe to (e.g., "orders/created")
   * @param {Function} [handler] - Optional message handler function
   * @param {Object} [options] - Subscription options
   * @param {boolean} [options.autoAck=true] - Whether to automatically acknowledge messages
   * @param {string} [options.appSecretKey] - App secret key for decrypting messages
   * @returns {Promise<Object>} Subscription object with methods for message handling
   * @throws {EnSyncError} If subscription fails
   */
  async subscribe(messageName, handler, options) {
    // Handle overloaded parameters: subscribe(name, handler, options) or subscribe(name, options)
    if (typeof handler === "object" && !options) {
      options = handler;
      handler = null;
    }

    options = options || { autoAck: true, appSecretKey: null };
    if (!this.#state.isAuthenticated) {
      throw new EnSyncError("Not authenticated", "EnSyncAuthError");
    }

    const request = {
      client_id: this.#config.clientId,
      message_name: messageName,
    };

    // Use shared subscription stream (server multiplexes all messages through first stream)
    if (!this.#subscriptionStream) {
      // First subscription - create the stream
      this.#subscriptionStream = this.#client.Subscribe(request);

      // Handle incoming messages from ALL subscriptions
      this.#subscriptionStream.on("data", async (messageData) => {
        try {
          const msgName = messageData.message_name;
          const subscription = this.#subscriptions.get(msgName);

          if (!subscription) {
            this.#logDebug(`${SERVICE_NAME} Received message for unsubscribed topic: ${msgName}`);
            return;
          }

          const processedMessage = await this.#processMessage(
            messageData,
            subscription.appSecretKey
          );

          if (processedMessage) {
            // Emit to EventEmitter listeners (message:messageName pattern)
            this.emit(`message:${msgName}`, processedMessage);

            // Call all handlers for this message
            for (const handler of subscription.handlers) {
              try {
                const result = handler(processedMessage);
                if (result instanceof Promise) {
                  await result;
                }

                // Auto-acknowledge if enabled
                if (subscription.autoAck && processedMessage.idem && processedMessage.block) {
                  await this.#ack(processedMessage.idem, processedMessage.block, msgName);
                }
              } catch (error) {
                this.#logError(`${SERVICE_NAME} Handler error:`, error);
              }
            }
          }
        } catch (error) {
          this.#logError(`${SERVICE_NAME} Message processing error:`, error);
        }
      });

      this.#subscriptionStream.on("error", (error) => {
        this.#logError(`${SERVICE_NAME} Subscription stream error:`, error);
        this.emit("error", error);
      });

      this.#subscriptionStream.on("end", () => {
        this.#log(`${SERVICE_NAME} Subscription stream ended`);
        this.#subscriptionStream = null;
      });
    } else {
      // Subsequent subscriptions - just send Subscribe RPC to register the topic
      this.#client.Subscribe(request);
    }

    // Register subscription locally
    if (!this.#subscriptions.has(messageName)) {
      this.#subscriptions.set(messageName, {
        handlers: new Set(),
        autoAck: options.autoAck,
        appSecretKey: options.appSecretKey,
      });
    }

    const subscription = this.#subscriptions.get(messageName);

    this.#log(`${SERVICE_NAME} Successfully subscribed to ${messageName}`);

    // If handler was provided, add it immediately
    if (handler && typeof handler === "function") {
      subscription.handlers.add(handler);
    }

    const subscriptionObject = {
      on: (handler) => this.#on(messageName, handler, options.appSecretKey, options.autoAck),
      ack: (messageIdem, block) => this.#ack(messageIdem, block, messageName),
      resume: () => this.#continueProcessing(messageName),
      pause: (reason = "") => this.#pauseProcessing(messageName, reason),
      defer: (messageIdem, delayMs = 1000, reason = "") =>
        this.#deferMessage(messageIdem, messageName, delayMs, reason),
      discard: (messageIdem, reason = "") => this.#discardMessage(messageIdem, messageName, reason),
      rollback: (messageIdem, block) => this.#rollback(messageIdem, block),
      replay: (messageIdem) => this.#replay(messageIdem, messageName, options.appSecretKey),
      unsubscribe: async () => this.#unsubscribe(messageName),
    };

    return subscriptionObject;
  }

  /**
   * Closes the gRPC connection
   * @returns {Promise<void>}
   */
  async close() {
    this.#state.shouldReconnect = false;
    this.#clearTimers();

    // Cancel the shared subscription stream
    if (this.#subscriptionStream) {
      this.#subscriptionStream.cancel();
      this.#subscriptionStream = null;
    }

    this.#subscriptions.clear();

    if (this.#client) {
      grpc.closeClient(this.#client);
    }
  }

  /**
   * Gets the client's public key (client hash)
   * @returns {string} The client's public key (base64 encoded)
   */
  getClientPublicKey() {
    return this.#config.clientHash;
  }

  /**
   * Gets the total byte size of a payload
   * @param {Object} payload - The payload object to measure
   * @returns {number} The byte size of the payload
   */
  getPayloadByteSize(payload) {
    const payloadString = JSON.stringify(payload);
    return Buffer.byteLength(payloadString, "utf8");
  }

  /**
   * Gets the top-level skeleton of a payload with property datatypes
   * @param {Object} payload - The payload object to analyze
   * @returns {Object} An object with the same keys but values replaced with their datatypes
   */
  getPayloadSkeleton(payload) {
    const skeleton = {};

    for (const key in payload) {
      if (payload.hasOwnProperty(key)) {
        const value = payload[key];

        // Determine the type
        if (value === null) {
          skeleton[key] = "null";
        } else if (Array.isArray(value)) {
          skeleton[key] = "array";
        } else {
          skeleton[key] = typeof value;
        }
      }
    }

    return skeleton;
  }

  /**
   * Analyzes a payload and returns both byte size and skeleton
   * @param {Object} payload - The payload object to analyze
   * @returns {Object} An object containing byteSize and skeleton properties
   */
  analyzePayload(payload) {
    const payloadString = JSON.stringify(payload);
    const byteSize = Buffer.byteLength(payloadString, "utf8");

    const skeleton = {};
    for (const key in payload) {
      if (payload.hasOwnProperty(key)) {
        const value = payload[key];
        skeleton[key] = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
      }
    }

    return {
      byteSize,
      skeleton,
    };
  }

  // Private methods

  /**
   * Internal logging method that respects the enableLogging flag
   * @private
   */
  #log(...args) {
    if (this.#config.enableLogging) {
      console.log(...args);
    }
  }

  /**
   * Internal error logging method that respects the enableLogging flag
   * @private
   */
  #logError(...args) {
    if (this.#config.enableLogging) {
      console.error(...args);
    }
  }

  /**
   * Internal debug logging method that respects the enableLogging flag
   * @private
   */
  #logDebug(...args) {
    if (this.#config.enableLogging) {
      console.debug(...args);
    }
  }

  /**
   * Authenticates with the EnSync server
   * @private
   */
  async #authenticate() {
    return new Promise((resolve, reject) => {
      this.#log(`${SERVICE_NAME} Sending authentication request...`);

      const request = {
        access_key: this.#config.appKey,
      };

      this.#client.Connect(request, (error, response) => {
        if (error) {
          this.#logError(`${SERVICE_NAME} Authentication failed:`, error);
          reject(new EnSyncError("Authentication failed: " + error.message, "EnSyncAuthError"));
          return;
        }

        if (response.success) {
          this.#log(`${SERVICE_NAME} Authentication successful`);
          this.#config.clientId = response.client_id;
          this.#config.clientHash = response.client_hash;
          this.#state.isAuthenticated = true;
          this.#state.isConnected = true;

          // Start heartbeat
          this.#startHeartbeat();

          resolve(response);
        } else {
          reject(
            new EnSyncError("Authentication failed: " + response.error_message, "EnSyncAuthError")
          );
        }
      });
    });
  }

  /**
   * Publishes a message via gRPC
   * @private
   */
  #publishMessage(request) {
    return new Promise((resolve, reject) => {
      this.#client.PublishMessage(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncPublishError"));
          return;
        }

        if (response.success) {
          resolve(response);
        } else {
          reject(new EnSyncError(response.error_message, "EnSyncPublishError"));
        }
      });
    });
  }

  /**
   * Processes a message from the stream
   * @private
   */
  async #processMessage(messageData, appSecretKey) {
    try {
      const decryptionKey = appSecretKey || this.#config.appSecretKey || this.#config.clientHash;

      if (!decryptionKey) {
        this.#logError(`${SERVICE_NAME} No decryption key available`);
        return null;
      }

      // Decode and decrypt payload
      const decodedPayloadJson = Buffer.from(messageData.payload, "base64").toString("utf8");
      const encryptedPayload = JSON.parse(decodedPayloadJson);

      let payload;

      // Check if this is a hybrid encrypted message
      if (encryptedPayload && encryptedPayload.type === "hybrid") {
        const { payload: encPayload, keys } = encryptedPayload;

        let decrypted = false;
        const recipientIds = Object.keys(keys);

        for (const recipientId of recipientIds) {
          try {
            const encryptedKey = keys[recipientId];
            const messageKey = decryptMessageKey(encryptedKey, decryptionKey);
            payload = JSON.parse(decryptWithMessageKey(encPayload, messageKey));
            decrypted = true;
            break;
          } catch (error) {
            this.#logDebug(`${SERVICE_NAME} Couldn't decrypt with recipient ID ${recipientId}`);
          }
        }

        if (!decrypted) {
          this.#logError(`${SERVICE_NAME} Failed to decrypt hybrid message`);
          return null;
        }
      } else {
        // Handle traditional encryption
        payload = JSON.parse(decryptEd25519(encryptedPayload, decryptionKey));
      }

      return {
        messageName: messageData.message_name,
        idem: messageData.message_idem,
        block: messageData.partition_block,
        timestamp: Date.now(),
        payload: payload,
        metadata: messageData.metadata ? JSON.parse(messageData.metadata) : {},
        sender: messageData.sender || null,
      };
    } catch (error) {
      this.#logError(`${SERVICE_NAME} Failed to process message:`, error);
      return null;
    }
  }

  /**
   * Adds an event handler for a subscribed event
   * @private
   */
  #on(eventName, handler, appSecretKey, autoAck = true) {
    const subscription = this.#subscriptions.get(eventName);
    if (subscription) {
      subscription.handlers.add(handler);
    }

    return () => {
      const sub = this.#subscriptions.get(eventName);
      if (sub) {
        sub.handlers.delete(handler);
      }
    };
  }

  /**
   * Unsubscribes from messages
   * @private
   */
  async #unsubscribe(messageName) {
    return new Promise((resolve, reject) => {
      const subscription = this.#subscriptions.get(messageName);

      if (!subscription) {
        reject(
          new EnSyncError(`No active subscription for ${messageName}`, "EnSyncSubscriptionError")
        );
        return;
      }

      const request = {
        client_id: this.#config.clientId,
        message_name: messageName,
      };

      this.#client.Unsubscribe(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncSubscriptionError"));
          return;
        }

        if (response.success) {
          // Only remove from local subscriptions map
          // Do NOT cancel the shared stream as other subscriptions may be using it
          this.#subscriptions.delete(messageName);
          this.#log(`${SERVICE_NAME} Successfully unsubscribed from ${messageName}`);
          resolve(response);
        } else {
          reject(new EnSyncError(response.message, "EnSyncSubscriptionError"));
        }
      });
    });
  }

  /**
   * Acknowledges a message
   * @private
   */
  async #ack(messageIdem, block, messageName) {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        message_idem: messageIdem,
        message_name: messageName,
        partition_block: block,
      };

      this.#client.AcknowledgeMessage(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncGenericError"));
          return;
        }

        if (response.success) {
          resolve(response.message);
        } else {
          reject(new EnSyncError(response.message, "EnSyncGenericError"));
        }
      });
    });
  }

  /**
   * Rolls back an event
   * @private
   */
  async #rollback(eventIdem, block) {
    // Note: Rollback is not in the proto, but keeping for API compatibility
    throw new EnSyncError("Rollback not implemented in gRPC version", "EnSyncGenericError");
  }

  /**
   * Replays a message
   * @private
   */
  async #replay(messageIdem, messageName, appSecretKey) {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        message_idem: messageIdem,
        message_name: messageName,
      };

      this.#client.ReplayMessage(request, async (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncReplayError"));
          return;
        }

        if (response.success) {
          try {
            // Process the replayed message data
            const messageData = JSON.parse(response.message_data);
            const processedMessage = await this.#processMessage(messageData, appSecretKey);
            resolve(processedMessage);
          } catch (err) {
            reject(new EnSyncError("Failed to process replayed message", "EnSyncReplayError"));
          }
        } else {
          reject(new EnSyncError(response.message, "EnSyncReplayError"));
        }
      });
    });
  }

  /**
   * Defers a message
   * @private
   */
  async #deferMessage(messageIdem, messageName, delayMs = 0, reason = "") {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        message_idem: messageIdem,
        message_name: messageName,
        delay_ms: delayMs,
        priority: 0,
        reason: reason,
      };

      this.#client.DeferMessage(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncDeferError"));
          return;
        }

        if (response.success) {
          resolve({
            status: "success",
            action: "deferred",
            messageId: messageIdem,
            delayMs,
            scheduledDelivery: response.delivery_time,
            timestamp: Date.now(),
          });
        } else {
          reject(new EnSyncError(response.message, "EnSyncDeferError"));
        }
      });
    });
  }

  /**
   * Discards a message
   * @private
   */
  async #discardMessage(messageIdem, messageName, reason = "") {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        message_idem: messageIdem,
        message_name: messageName,
        reason: reason,
      };

      this.#client.DiscardMessage(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncDiscardError"));
          return;
        }

        if (response.success) {
          resolve({
            status: "success",
            action: "discarded",
            messageId: messageIdem,
            timestamp: Date.now(),
          });
        } else {
          reject(new EnSyncError(response.message, "EnSyncDiscardError"));
        }
      });
    });
  }

  /**
   * Pauses message processing
   * @private
   */
  async #pauseProcessing(messageName, reason = "") {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        message_name: messageName,
        reason: reason,
      };

      this.#client.PauseMessages(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncPauseError"));
          return;
        }

        if (response.success) {
          resolve({
            status: "success",
            action: "paused",
            messageName,
            reason: reason || undefined,
          });
        } else {
          reject(new EnSyncError(response.message, "EnSyncPauseError"));
        }
      });
    });
  }

  /**
   * Continues message processing
   * @private
   */
  async #continueProcessing(messageName) {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        message_name: messageName,
      };

      this.#client.ContinueMessages(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncContinueError"));
          return;
        }

        if (response.success) {
          resolve({
            status: "success",
            action: "continued",
            messageName,
          });
        } else {
          reject(new EnSyncError(response.message, "EnSyncContinueError"));
        }
      });
    });
  }

  /**
   * Starts heartbeat interval
   * @private
   */
  #startHeartbeat() {
    this.#state.heartbeatTimeout = setInterval(() => {
      if (!this.#state.isAuthenticated) return;

      const request = {
        client_id: this.#config.clientId,
      };

      this.#client.Heartbeat(request, (error, response) => {
        if (error) {
          this.#logError(`${SERVICE_NAME} Heartbeat failed:`, error);
        } else if (response.success) {
          this.#log(`${SERVICE_NAME} Heartbeat successful`);
        }
      });
    }, this.#config.heartbeatInterval);
  }

  /**
   * Clears all timers
   * @private
   */
  #clearTimers() {
    if (this.#state.heartbeatTimeout) {
      clearInterval(this.#state.heartbeatTimeout);
      this.#state.heartbeatTimeout = null;
    }
  }
}

module.exports = {
  EnSyncEngine,
  EnSyncError,
};
