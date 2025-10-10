const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const { EnSyncError, GENERIC_MESSAGE } = require("./error");
const naclUtil = require("tweetnacl-util");
const {
  encryptEd25519,
  decryptEd25519,
  hybridEncrypt,
  hybridDecrypt,
  decryptMessageKey,
  decryptWithMessageKey,
} = require("./ecc-crypto");

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

class EnSyncEngine {
  /** @type {Object} */
  #client = null;

  /** @type {Object} */
  #config = {
    url: null,
    accessKey: null,
    clientId: null,
    clientHash: null,
    appSecretKey: null,
    heartbeatInterval: 30000, // 30 seconds
    maxReconnectAttempts: 5,
  };

  /** @type {Object} */
  #state = {
    isConnected: false,
    isAuthenticated: false,
    reconnectAttempts: 0,
    heartbeatTimeout: null,
    shouldReconnect: true,
  };

  /** @type {Object.<string, Set<Function>>} */
  #eventHandlers = {
    message: new Set(),
    error: new Set(),
    reconnect: new Set(),
    close: new Set(),
  };

  /** @type {Map<string, Object>} */
  #subscriptions = new Map();

  /**
   * Creates a new EnSync gRPC client
   * @param {string} url - gRPC server URL (e.g., "grpc://localhost:50051" or "grpcs://node.ensync.cloud:50051")
   * @param {Object} options - Configuration options
   * @param {number} [options.heartbeatInterval] - Heartbeat interval in ms (default: 30000)
   * @param {number} [options.maxReconnectAttempts] - Max reconnect attempts (default: 5)
   */
  constructor(url, options = {}) {
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

    // Create gRPC client with appropriate credentials
    const credentials = useSecure
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();

    this.#client = new ensyncProto.EnSyncService(serverAddress, credentials);
  }

  /**
   * Creates a new gRPC client and authenticates
   * @param {string} accessKey - The access key for authentication
   * @param {Object} options - Additional options
   * @param {string} [options.appSecretKey] - App secret key for decryption
   * @returns {Promise<EnSyncEngine>} A new EnSync gRPC client instance
   * @throws {EnSyncError} If client creation fails
   */
  async createClient(accessKey, options = {}) {
    this.#config.accessKey = accessKey;
    if (options.appSecretKey) this.#config.appSecretKey = options.appSecretKey;
    await this.#authenticate();
    return this;
  }

  /**
   * Publishes an event to the EnSync system
   * @param {string} eventName - Name of the event
   * @param {string[]} recipients - Array of base64 encoded public keys of recipients
   * @param {Object} payload - Event payload
   * @param {Object} metadata - Event metadata
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.useHybridEncryption=true] - Whether to use hybrid encryption (default: true)
   * @returns {Promise<string>} Server response
   * @throws {EnSyncError} If publishing fails
   */
  async publish(
    eventName,
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

    const useHybridEncryption = options.useHybridEncryption !== false; // Default to true

    // Calculate payload metadata
    const payloadMetadata = this.analyzePayload(payload);
    const payloadMetadataString = JSON.stringify({
      byte_size: payloadMetadata.byteSize,
      skeleton: payloadMetadata.skeleton
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
          event_name: eventName,
          payload: encryptedBase64,
          delivery_to: recipient,
          metadata: JSON.stringify(metadata),
          payload_metadata: payloadMetadataString,
        };

        const response = await this.#publishEvent(request);
        responses.push(response.event_idem);
      }

      return responses.join(",");
    } catch (error) {
      throw new EnSyncError(error, "EnSyncPublishError");
    }
  }

  /**
   * Subscribes to an event
   * @param {string} eventName - Name of the event to subscribe to
   * @param {Object} options - Subscription options
   * @param {boolean} [options.autoAck=false] - Whether to automatically acknowledge events
   * @param {string} [options.appSecretKey=null] - App secret key for decrypting messages
   * @returns {Promise<Object>} Subscription object with methods for event handling
   * @throws {EnSyncError} If subscription fails
   */
  async subscribe(eventName, options = { autoAck: true, appSecretKey: null }) {
    if (!this.#state.isAuthenticated) {
      throw new EnSyncError("Not authenticated", "EnSyncAuthError");
    }

    const request = {
      client_id: this.#config.clientId,
      event_name: eventName,
    };

    // Create subscription stream
    const call = this.#client.Subscribe(request);

    if (!this.#subscriptions.has(eventName)) {
      this.#subscriptions.set(eventName, {
        call,
        handlers: new Set(),
        autoAck: options.autoAck,
        appSecretKey: options.appSecretKey,
      });
    }

    const subscription = this.#subscriptions.get(eventName);

    // Handle incoming events
    call.on("data", async (eventData) => {
      try {
        const processedEvent = await this.#processEvent(eventData, options.appSecretKey);

        if (processedEvent) {
          // Call all handlers for this event
          for (const handler of subscription.handlers) {
            try {
              const result = handler(processedEvent);
              if (result instanceof Promise) {
                await result;
              }

              // Auto-acknowledge if enabled
              if (options.autoAck && processedEvent.idem && processedEvent.block) {
                await this.#ack(processedEvent.idem, processedEvent.block, eventName);
              }
            } catch (error) {
              console.error(`${SERVICE_NAME} Handler error:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`${SERVICE_NAME} Event processing error:`, error);
      }
    });

    call.on("error", (error) => {
      console.error(`${SERVICE_NAME} Subscription error:`, error);
    });

    call.on("end", () => {
      console.log(`${SERVICE_NAME} Subscription ended for ${eventName}`);
    });

    console.log(`${SERVICE_NAME} Successfully subscribed to ${eventName}`);

    return {
      on: (handler) => this.#on(eventName, handler, options.appSecretKey, options.autoAck),
      ack: (eventIdem, block) => this.#ack(eventIdem, block, eventName),
      resume: () => this.#continueProcessing(eventName),
      pause: (reason = "") => this.#pauseProcessing(eventName, reason),
      defer: (eventIdem, delayMs = 1000, reason = "") =>
        this.#deferEvent(eventIdem, eventName, delayMs, reason),
      discard: (eventIdem, reason = "") => this.#discardEvent(eventIdem, eventName, reason),
      rollback: (eventIdem, block) => this.#rollback(eventIdem, block),
      replay: (eventIdem) => this.#replay(eventIdem, eventName, options.appSecretKey),
      unsubscribe: async () => this.#unsubscribe(eventName),
    };
  }

  /**
   * Closes the gRPC connection
   * @returns {Promise<void>}
   */
  async close() {
    this.#state.shouldReconnect = false;
    this.#clearTimers();

    // Close all active subscriptions
    for (const [eventName, subscription] of this.#subscriptions.entries()) {
      if (subscription.call) {
        subscription.call.cancel();
      }
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
    return Buffer.byteLength(payloadString, 'utf8');
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
          skeleton[key] = 'null';
        } else if (Array.isArray(value)) {
          skeleton[key] = 'array';
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
    const byteSize = Buffer.byteLength(payloadString, 'utf8');
    
    const skeleton = {};
    for (const key in payload) {
      if (payload.hasOwnProperty(key)) {
        const value = payload[key];
        skeleton[key] = value === null ? 'null' : (Array.isArray(value) ? 'array' : typeof value);
      }
    }
    
    return {
      byteSize,
      skeleton
    };
  }

  // Private methods

  /**
   * Authenticates with the EnSync server
   * @private
   */
  async #authenticate() {
    return new Promise((resolve, reject) => {
      console.log(`${SERVICE_NAME} Sending authentication request...`);

      const request = {
        access_key: this.#config.accessKey,
      };

      this.#client.Connect(request, (error, response) => {
        if (error) {
          console.error(`${SERVICE_NAME} Authentication failed:`, error);
          reject(new EnSyncError("Authentication failed: " + error.message, "EnSyncAuthError"));
          return;
        }

        if (response.success) {
          console.log(`${SERVICE_NAME} Authentication successful`);
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
   * Publishes an event via gRPC
   * @private
   */
  #publishEvent(request) {
    return new Promise((resolve, reject) => {
      this.#client.PublishEvent(request, (error, response) => {
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
   * Processes an event from the stream
   * @private
   */
  async #processEvent(eventData, appSecretKey) {
    try {
      const decryptionKey = appSecretKey || this.#config.appSecretKey || this.#config.clientHash;

      if (!decryptionKey) {
        console.error(`${SERVICE_NAME} No decryption key available`);
        return null;
      }

      // Decode and decrypt payload
      const decodedPayloadJson = Buffer.from(eventData.payload, "base64").toString("utf8");
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
            console.debug(`${SERVICE_NAME} Couldn't decrypt with recipient ID ${recipientId}`);
          }
        }

        if (!decrypted) {
          console.error(`${SERVICE_NAME} Failed to decrypt hybrid message`);
          return null;
        }
      } else {
        // Handle traditional encryption
        payload = JSON.parse(decryptEd25519(encryptedPayload, decryptionKey));
      }

      return {
        eventName: eventData.event_name,
        idem: eventData.event_idem,
        block: eventData.partition_block,
        timestamp: Date.now(),
        payload: payload,
        metadata: eventData.metadata ? JSON.parse(eventData.metadata) : {},
        sender: eventData.sender || null,
      };
    } catch (error) {
      console.error(`${SERVICE_NAME} Failed to process event:`, error);
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
   * Unsubscribes from an event
   * @private
   */
  async #unsubscribe(eventName) {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        event_name: eventName,
      };

      this.#client.Unsubscribe(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncSubscriptionError"));
          return;
        }

        if (response.success) {
          const subscription = this.#subscriptions.get(eventName);
          if (subscription && subscription.call) {
            subscription.call.cancel();
          }
          this.#subscriptions.delete(eventName);
          console.log(`${SERVICE_NAME} Successfully unsubscribed from ${eventName}`);
          resolve();
        } else {
          reject(new EnSyncError(response.message, "EnSyncSubscriptionError"));
        }
      });
    });
  }

  /**
   * Acknowledges an event
   * @private
   */
  async #ack(eventIdem, block, eventName) {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        event_idem: eventIdem,
        event_name: eventName,
        partition_block: block,
      };

      this.#client.AcknowledgeEvent(request, (error, response) => {
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
   * Replays an event
   * @private
   */
  async #replay(eventIdem, eventName, appSecretKey) {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        event_idem: eventIdem,
        event_name: eventName,
      };

      this.#client.ReplayEvent(request, async (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncReplayError"));
          return;
        }

        if (response.success) {
          try {
            // Process the replayed event data
            const eventData = JSON.parse(response.event_data);
            const processedEvent = await this.#processEvent(eventData, appSecretKey);
            resolve(processedEvent);
          } catch (err) {
            reject(new EnSyncError("Failed to process replayed event", "EnSyncReplayError"));
          }
        } else {
          reject(new EnSyncError(response.message, "EnSyncReplayError"));
        }
      });
    });
  }

  /**
   * Defers an event
   * @private
   */
  async #deferEvent(eventIdem, eventName, delayMs = 0, reason = "") {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        event_idem: eventIdem,
        event_name: eventName,
        delay_ms: delayMs,
        priority: 0,
        reason: reason,
      };

      this.#client.DeferEvent(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncDeferError"));
          return;
        }

        if (response.success) {
          resolve({
            status: "success",
            action: "deferred",
            eventId: eventIdem,
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
   * Discards an event
   * @private
   */
  async #discardEvent(eventIdem, eventName, reason = "") {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        event_idem: eventIdem,
        event_name: eventName,
        reason: reason,
      };

      this.#client.DiscardEvent(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncDiscardError"));
          return;
        }

        if (response.success) {
          resolve({
            status: "success",
            action: "discarded",
            eventId: eventIdem,
            timestamp: Date.now(),
          });
        } else {
          reject(new EnSyncError(response.message, "EnSyncDiscardError"));
        }
      });
    });
  }

  /**
   * Pauses event processing
   * @private
   */
  async #pauseProcessing(eventName, reason = "") {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        event_name: eventName,
        reason: reason,
      };

      this.#client.PauseEvents(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncPauseError"));
          return;
        }

        if (response.success) {
          resolve({
            status: "success",
            action: "paused",
            eventName,
            reason: reason || undefined,
          });
        } else {
          reject(new EnSyncError(response.message, "EnSyncPauseError"));
        }
      });
    });
  }

  /**
   * Continues event processing
   * @private
   */
  async #continueProcessing(eventName) {
    return new Promise((resolve, reject) => {
      const request = {
        client_id: this.#config.clientId,
        event_name: eventName,
      };

      this.#client.ContinueEvents(request, (error, response) => {
        if (error) {
          reject(new EnSyncError(error.message, "EnSyncContinueError"));
          return;
        }

        if (response.success) {
          resolve({
            status: "success",
            action: "continued",
            eventName,
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
          console.error(`${SERVICE_NAME} Heartbeat failed:`, error);
        } else if (response.success) {
          console.log(`${SERVICE_NAME} Heartbeat successful`);
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
