const WebSocket = require('ws');
const { EnSyncError, GENERIC_MESSAGE } = require("./error");
const naclUtil = require('tweetnacl-util');
const { encryptEd25519, decryptEd25519 } = require('./ecc-crypto');

const SERVICE_NAME = 'EnSync:';

class EnSyncEngine {
    /** @type {WebSocket} */
    #ws = null;

    /** @type {Map<string, Function>} */
    #messageCallbacks = new Map();

    /** @type {Object} */
    #config = {
        url: null,
        accessKey: null,
        clientId: null,
        clientHash: null,
        appSecretKey: null,
        pingInterval: 30000, // 30 seconds
        reconnectInterval: 5000, // 5 seconds
        maxReconnectAttempts: 5
    };

    /** @type {Object} */
    #state = {
        isConnected: false,
        isAuthenticated: false,
        reconnectAttempts: 0,
        pingTimeout: null,
        reconnectTimeout: null,
        shouldReconnect: true
    };

    /** @type {Object.<string, Set<Function>>} */
    #eventHandlers = {
        message: new Set(),
        error: new Set(),
        reconnect: new Set(),
        close: new Set()
    };

    /** @type {Map<string, Set<Function>>} */
    #subscriptions = new Map();

    /**
     * Creates a new EnSync WebSocket client
     * @param {string} url - WebSocket URL (e.g., "wss://localhost:8443")
     * @param {Object} options - Configuration options
     * @param {string} options.accessKey - Access key for authentication
     * @param {number} [options.pingInterval] - Ping interval in ms (default: 30000)
     * @param {number} [options.reconnectInterval] - Reconnect interval in ms (default: 5000)
     * @param {number} [options.maxReconnectAttempts] - Max reconnect attempts (default: 5)
     */
    constructor(url, options = {}) {
        this.#config.url = url.replace(/^http/, 'ws') + '/message';
        if (options.pingInterval) this.#config.pingInterval = options.pingInterval;
        if (options.reconnectInterval) this.#config.reconnectInterval = options.reconnectInterval;
        if (options.maxReconnectAttempts) this.#config.maxReconnectAttempts = options.maxReconnectAttempts;
    }

    /**
     * Creates a new WebSocket client
     * @param {string} accessKey - The access key for authentication
     * @returns {Promise<EnSyncEngine>} A new EnSync WebSocket client instance
     * @throws {EnSyncError} If client creation fails
     */
    async createClient(accessKey, options = {}) {
        this.#config.accessKey = accessKey;
        if (options.appSecretKey) this.#config.appSecretKey = options.appSecretKey;
        await this.connect();
        return this;
    }

    #convertKeyValueToObject(data, options = {}) {
        const { startsWith = "{", endsWith = "}" } = options;
        const convertedRecords = {};
        // Remove the curly braces wrapping the data
        const items =
          data.startsWith(startsWith) && data.endsWith(endsWith)
            ? data.substring(1, data.length - 1).split(",")
            : data.split(",");
        items.forEach((item, i) => {
          const [key, value] = item.split("=");
    
          convertedRecords[key.trim()] = value.trim();
        });
        return convertedRecords;
    }
    
    #convertKeyValueToObj(data) {
        // const result = data
        //   .replace(/(\w+)=/g, '"$1"=')
        //   .replace(/=(\w+)/g, '="$1"')
        //   .replaceAll("=", ": ");
        console.log("data", data);
        return data;
    }

    /**
     * Connects to the EnSync WebSocket server and authenticates
     * @returns {Promise<void>}
     * @throws {EnSyncError} If connection or authentication fails
     */
    async connect() {
        console.log(`${SERVICE_NAME} Connecting to ${this.#config.url}...`);
        return new Promise((resolve, reject) => {
            try {
                this.#ws = new WebSocket(this.#config.url);
                
                this.#ws.on('open', () => {
                    console.log(`${SERVICE_NAME} WebSocket connection established`);
                    this.#state.isConnected = true;
                    this.#state.reconnectAttempts = 0;
                    console.log(`${SERVICE_NAME} Attempting authentication...`);
                    this.#authenticate().then(resolve).catch(reject);
                });

                this.#ws.on('message', (data) => {
                    this.#handleMessage(data);
                });

                this.#ws.on('error', (error) => {
                    console.error(`${SERVICE_NAME} WebSocket error - ${error}`);
                    this.#handleError(error);
                });

                this.#ws.on('close', (code, reason) => {
                    console.log(`${SERVICE_NAME} WebSocket closed with code ${code}${reason ? ': ' + reason : ''}`);
                    this.#handleClose(code, reason);
                });

                this.#ws.on('pong', () => {
                    console.log(`${SERVICE_NAME} Received pong from server - Connection alive`);
                    this.#handlePong();
                });

                // Start ping interval
                this.#startPingInterval();
            } catch (error) {
                const wsError = new EnSyncError(error, "EnSyncConnectionError");
                console.error(`${SERVICE_NAME} Connection error - ${error}`);
                reject(wsError);
            }
        });
    }

    /**
     * Publishes an event to the EnSync system
     * @param {string} eventName - Name of the event
     * @param {string[]} recipients - Array of base64 encoded public keys of recipients
     * @param {Object} payload - Event payload
     * @param {Object} metadata - Event metadata
     * @returns {Promise<string>} Server response
     * @throws {EnSyncError} If publishing fails
     */
    async publish(eventName, recipients = [], payload = {}, metadata = { persist: true, headers: {} }) {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }

        if (!Array.isArray(recipients)) {
            throw new EnSyncError("recipients must be an array", "EnSyncAuthError");
        }

        if (recipients.length === 0) {
            throw new EnSyncError("recipients array cannot be empty", "EnSyncAuthError");
        }

        try {
            const responses = [];
            // Encrypt and send for each recipient individually
            for (const recipient of recipients) {
                const encrypted = encryptEd25519(JSON.stringify(payload), naclUtil.decodeBase64(recipient));
                const encryptedBase64 = naclUtil.encodeBase64(Buffer.from(JSON.stringify(encrypted)));

                const message = `PUB;CLIENT_ID=:${this.#config.clientId};EVENT_NAME=:${eventName};PAYLOAD=:${encryptedBase64};DELIVERY_TO=:${recipient};METADATA=:${JSON.stringify(metadata)}`;
                const response = await this.#sendMessage(message);
                responses.push(response);
            }
            
            return responses.join(',');
        } catch (error) {
            throw new EnSyncError(error, "EnSyncPublishError");
        }
    }

    /**
     * Permanently rejects an event without processing
     * @param {string} eventId - Unique identifier of the event (required)
     * @param {string} eventName - Name of the event (required)
     * @param {string} [reason=""] - Optional explanation for discarding
     * @returns {Promise<Object>} Response object with status, action, eventId, and timestamp
     * @throws {EnSyncError} If event is not found or operation fails
     */
    async #discardEvent(eventId, eventName, reason = "") {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }

        try {
            const message = `DISCARD;CLIENT_ID=:${this.#config.clientId};EVENT_IDEM=:${eventId};EVENT_NAME=:${eventName};REASON=:${reason}`;
            const response = await this.#sendMessage(message);
            
            if (response.startsWith("-FAIL:")) {
                throw new EnSyncError(response.substring(6), "EnSyncEventError");
            }

            return {
                status: "success",
                action: "discarded",
                eventId,
                timestamp: Date.now()
            };
        } catch (error) {
            if (error instanceof EnSyncError) throw error;
            throw new EnSyncError(error, "EnSyncDiscardError");
        }
    }

    /**
     * Postpones processing of an event for later delivery
     * @param {string} eventId - Unique identifier of the event (required)
     * @param {number} delayMs - Milliseconds to delay (1000ms to 24h, or 0 for immediate redelivery) (required)
     * @param {string} [reason=""] - Optional explanation for deferring
     * @returns {Promise<Object>} Response object with status, action, eventId, delayMs, scheduledDelivery, and timestamp
     * @throws {EnSyncError} If event is not found, delay is invalid, or operation fails
     */
    async #deferEvent(eventId, delayMs = 0, reason = "") {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }

        // Validate delay range (1 second to 24 hours)
        if (delayMs !== 0 && (delayMs < 1000 || delayMs > 24 * 60 * 60 * 1000)) {
            throw new EnSyncError(INVALID_DELAY, "EnSyncValidationError");
        }

        try {
            const message = `DEFER;CLIENT_ID=:${this.#config.clientId};EVENT_IDEM=:${eventId};DELAY=:${delayMs};REASON=:${reason}`;
            const response = await this.#sendMessage(message);
            
            if (response.startsWith("-FAIL")) {
                throw new EnSyncError(response.substring(6), "EnSyncEventError");
            }

            const now = Date.now();
            return {
                status: "success",
                action: "deferred",
                eventId,
                delayMs,
                scheduledDelivery: now + delayMs,
                timestamp: now
            };
        } catch (error) {
            if (error instanceof EnSyncError) throw error;
            throw new EnSyncError(error, "EnSyncDeferError");
        }
    }

    /**
     * Resumes event processing after defer/skip operations
     * @param {string} eventName - Name of the event to resume processing for (required)
     * @returns {Promise<Object>} Response object with status, action, and eventName
     * @throws {EnSyncError} If operation fails or eventName is missing
     */
    async #continueProcessing(eventName) {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }

        try {
            const message = `CONTINUE;CLIENT_ID=:${this.#config.clientId};EVENT_NAME=:${eventName}`;
            const response = await this.#sendMessage(message);

            if (response.startsWith("-FAIL:")) {
                throw new EnSyncError(response.substring(6), "EnSyncContinueError");
            }

            return {
                status: "success",
                action: "continued",
                eventName
            };
        } catch (error) {
            if (error instanceof EnSyncError) throw error;
            throw new EnSyncError(error, "EnSyncContinueError");
        }
    }

    /**
     * Pauses event processing for a specific event
     * @param {string} eventName - Name of the event to pause processing for (required)
     * @param {string} [reason=""] - Optional explanation for pausing
     * @returns {Promise<Object>} Response object with status, action, eventName, and reason
     * @throws {EnSyncError} If operation fails or eventName is missing
     */
    async #pauseProcessing(eventName, reason = "") {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }

        try {
            const message = `PAUSE;CLIENT_ID=:${this.#config.clientId};EVENT_NAME=:${eventName};REASON=:${reason}`;
            const response = await this.#sendMessage(message);

            if (response.startsWith("-FAIL:")) {
                throw new EnSyncError(response.substring(6), "EnSyncPauseError");
            }

            return {
                status: "success",
                action: "paused",
                eventName,
                reason: reason || undefined
            };
        } catch (error) {
            if (error instanceof EnSyncError) throw error;
            throw new EnSyncError(error, "EnSyncPauseError");
        }
    }

    /**
     * Subscribes to an event
     * @param {string} eventName - Name of the event to subscribe to
     * @param {Object} options - Subscription options
     * @param {boolean} [options.autoAck=false] - Whether to automatically acknowledge events
     * @param {string} [options.appSecretKey=null] - App secret key for decrypting messages
     * @returns {Promise<Object>} Subscription object with methods for event handling
     * @returns {Function} subscription.on - Add an event handler
     * @returns {Function} subscription.on(handler) - Register a handler function that receives event data
     * @returns {Function} subscription.ack - Acknowledge an event
     * @returns {Function} subscription.ack(eventIdem, block) - Acknowledge receipt of an event with its ID and block
     * @returns {Function} subscription.resume - Resume event processing
     * @returns {Function} subscription.resume() - Resume processing of events for this subscription
     * @returns {Function} subscription.pause - Pause event processing
     * @returns {Function} subscription.pause([reason]) - Pause event delivery with optional reason
     * @returns {Function} subscription.defer - Defer an event
     * @returns {Function} subscription.defer(eventIdem, delayMs, [reason]) - Defer processing of an event for specified milliseconds
     * @returns {Function} subscription.discard - Discard an event
     * @returns {Function} subscription.discard(eventIdem, [reason]) - Permanently discard an event with optional reason
     * @returns {Function} subscription.rollback - Rollback an event
     * @returns {Function} subscription.rollback(eventIdem, block) - Roll back an event with its ID and block
     * @returns {Function} subscription.replay - Request a specific event to be sent again
     * @returns {Function} subscription.replay(eventIdem) - Request replay of a specific event by ID
     * @returns {Function} subscription.unsubscribe - Unsubscribe from the event
     * @returns {Function} subscription.unsubscribe() - Stop receiving events for this subscription
     * @throws {EnSyncError} If subscription fails
     */
    async subscribe(eventName, options = {autoAck: true, appSecretKey: null}) {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }

        const message = `SUB;CLIENT_ID=:${this.#config.clientId};EVENT_NAME=:${eventName}`;
        const response = await this.#sendMessage(message);

        if (response.startsWith('+PASS:')) {
            if (!this.#subscriptions.has(eventName)) {
                this.#subscriptions.set(eventName, new Set());
            }
            console.log(`${SERVICE_NAME} Successfully subscribed to ${eventName}`);
            return {
                on: (handler) => this.#on(eventName, handler, options.appSecretKey, options.autoAck),
                ack: (eventIdem, block) => this.#ack(eventIdem, block, eventName),
                resume: () => this.#continueProcessing(eventName),
                pause: (reason = "") => this.#pauseProcessing(eventName, reason),
                defer: (eventIdem, delayMs, reason = "") => this.#deferEvent(eventIdem, delayMs, reason),
                discard: (eventIdem, reason = "") => this.#discardEvent(eventIdem, eventName, reason),
                rollback: (eventIdem, block) => this.#rollback(eventIdem, block),
                replay: (eventIdem) => this.#replay(eventIdem, eventName, options.appSecretKey),
                unsubscribe: async () => this.#unsubscribe(eventName)
            };
        } else {
            throw new EnSyncError(`Subscription failed: ${response}`, "EnSyncSubscriptionError");
        }
    }

    /**
     * Adds an event handler for a subscribed event
     * @param {string} eventName - Name of the event
     * @param {Function} handler - Event handler function that receives the event data
     * @param {string} [appSecretKey] - Optional app secret key for decryption (overrides client key)
     * @param {boolean} [autoAck=true] - Whether to automatically acknowledge events
     * @returns {Function} Unsubscribe function that removes this handler when called
     */
    #on(eventName, handler, appSecretKey, autoAck = true) {
        if (!this.#subscriptions.has(eventName)) {
            this.#subscriptions.set(eventName, new Set());
        }
        const wrappedHandler = { handler, appSecretKey, autoAck };
        this.#subscriptions.get(eventName).add(wrappedHandler);

        return () => {
            const handlers = this.#subscriptions.get(eventName);
            if (handlers) {
                const handlerToDelete = Array.from(handlers).find(h => h.handler === handler);
                if (handlerToDelete) handlers.delete(handlerToDelete);
                if (handlers.size === 0) {
                    this.#subscriptions.delete(eventName);
                }
            }
        };
    }

    /**
     * Unsubscribes from an event
     * @private
     * @param {string} eventName - Name of the event to unsubscribe from
     * @returns {Promise<void>}
     */
    async #unsubscribe(eventName) {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }

        const message = `UNSUB;CLIENT_ID=:${this.#config.clientId};EVENT_NAME=:${eventName}`;
        const response = await this.#sendMessage(message);

        if (response.startsWith('+PASS:')) {
            this.#subscriptions.delete(eventName);
            console.log(`${SERVICE_NAME} Successfully unsubscribed from ${eventName}`);
        } else {
            throw new EnSyncError(`Unsubscribe failed: ${response}`, "EnSyncSubscriptionError");
        }
    }

    /**
     * Decrypts an encrypted payload using the provided key or fallback keys
     * @private
     * @param {Object} eventData - The event data containing the encrypted payload
     * @param {string} [appSecretKey] - Optional app secret key for decryption
     * @returns {Object} Object with success flag and decrypted payload if successful
     */
    #decryptPayload(eventData, appSecretKey) {
        try {
            // Use subscription key if available, otherwise fall back to client key
            const decryptionKey = appSecretKey || this.#config.appSecretKey || this.#config.clientHash;
            
            if (!decryptionKey) {
                console.error(`${SERVICE_NAME} No decryption key available`);
                return { success: false };
            }
            
            const payload = JSON.parse(decryptEd25519(eventData.encryptedPayload, decryptionKey));
            
            // Remove encryptedPayload from eventData as it's no longer needed
            delete eventData.encryptedPayload;
            
            return { success: true, payload };
        } catch (decryptError) {
            console.error(`${SERVICE_NAME} Failed to decrypt with key -`, decryptError);
            return { success: false };
        }
    }

    /**
     * Parses an event message
     * @private
     */
    #parseEventMessage(message) {
        try {
            if (message.startsWith("-FAIL:")) throw new EnSyncError(message, "EnSyncGenericError");
            if (!message.startsWith("+RECORD:") && !message.startsWith("+REPLAY:")) return null;

            const content = message.replace("+RECORD:", "").replace("+REPLAY:", "");
            const record = JSON.parse(content);
            
            if (record && record.constructor.name === "Object") {
                if (record.payload) {
                    try {
                        // Just parse and store the encrypted payload for handlers to decrypt
                        const decodedPayloadJson = Buffer.from(record.payload, 'base64').toString('utf8');
                        const encryptedPayload = JSON.parse(decodedPayloadJson);
                        record.encryptedPayload = encryptedPayload;
                        record.payload = null; // Will be decrypted by handlers
                    } catch (e) {
                        console.error(`${SERVICE_NAME} Failed to process event payload:`, e);
                        return null;
                    }
                }

                return {
                    eventName: record.name,
                    idem: record.idem || record.id,
                    block: record.block,
                    timestamp: record.loggedAt,
                    payload: record.payload,
                    encryptedPayload: record.encryptedPayload,
                    metadata: record.metadata || {}
                };
            }
            return null;
        } catch (e) {
            console.error(`${SERVICE_NAME} Failed to parse event message:`, e);
            return null;
        }
    }

    /**
     * Closes the WebSocket connection
     * @returns {Promise<void>}
     */
    async close() {
        this.#state.shouldReconnect = false;
        return new Promise((resolve) => {
            this.#clearTimers();
            if (this.#ws) {
                this.#ws.once('close', resolve);
                this.#ws.close();
            } else {
                resolve();
            }
        });
    }

    // Private methods

    /**
     * Authenticates with the EnSync server
     * @private
     */
    async #authenticate() {
        console.log(`${SERVICE_NAME} Sending authentication message...`);
        const authMessage = `CONN;ACCESS_KEY=:${this.#config.accessKey}`;
        const response = await this.#sendMessage(authMessage);
        
        if (response.startsWith('+PASS:')) {
            console.log(`${SERVICE_NAME} Authentication successful`);
            const content = response.replace("+PASS:", "");
            const resp = this.#convertKeyValueToObject(content);
            this.#config.clientId = resp.clientId;
            this.#config.clientHash = resp.clientHash;
            this.#state.isAuthenticated = true;

            // Store the current subscriptions before clearing them
            const currentSubscriptions = new Map();
            
            // Deep copy the handlers to preserve them properly
            for (const [eventName, handlers] of this.#subscriptions.entries()) {
                const handlersCopy = new Set();
                handlers.forEach(handlerObj => {
                    handlersCopy.add({
                        handler: handlerObj.handler,
                        appSecretKey: handlerObj.appSecretKey,
                        autoAck: handlerObj.autoAck
                    });
                });
                currentSubscriptions.set(eventName, handlersCopy);
            }
            
            // Clear existing subscriptions as we'll recreate them
            this.#subscriptions.clear();
            
            // Resubscribe to each event and restore its handlers
            for (const [eventName, handlers] of currentSubscriptions.entries()) {
                try {
                    console.log(`${SERVICE_NAME} Resubscribing to ${eventName}`);
                    await this.subscribe(eventName);
                    
                    // Restore all handlers for this event
                    if (handlers && handlers.size > 0) {
                        handlers.forEach(handlerObj => {
                            this.#on(eventName, handlerObj.handler, handlerObj.appSecretKey, handlerObj.autoAck);
                        });
                    }
                } catch (error) {
                    console.error(`${SERVICE_NAME} Failed to resubscribe to ${eventName}:`, error);
                }
            }
            return response;
        } else {
            throw new EnSyncError("Authentication failed: " + response, "EnSyncAuthError");
        }
    }

    /**
     * Sends a message and waits for response
     * @private
     */
    #sendMessage(message) {
        return new Promise((resolve, reject) => {
            const messageId = Date.now().toString();
            
            const timeout = setTimeout(() => {
                this.#messageCallbacks.delete(messageId);
                console.log(`${SERVICE_NAME} Message timeout for request: ${message.substring(0, 30)}...`);
                reject(new EnSyncError("Message timeout", "EnSyncTimeoutError"));
            }, 30000); // Increased timeout to 30 seconds

            this.#messageCallbacks.set(messageId, { resolve, reject, timeout });
            
            if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
                console.log("message", message)
                this.#ws.send(message);
            } else {
                clearTimeout(timeout);
                reject(new EnSyncError("WebSocket not connected", "EnSyncConnectionError"));
            }
        });
    }

    /**
     * Handles incoming WebSocket messages
     * @private
     */
    #handleMessage(data) {
        const message = data.toString();
        
        // Handle PING from server
        if (message === 'PING') {
            this.#ws.send('PONG');
            return;
        }

        // Handle event messages
        if (message.startsWith('+RECORD:')) {
            // Parse the message into event data
            const rawEventData = this.#parseEventMessage(message);
            console.log(`${SERVICE_NAME} Received event for ${rawEventData?.eventName || 'unknown event'}`);
            
            if (rawEventData && this.#subscriptions.has(rawEventData.eventName)) {
                const handlers = this.#subscriptions.get(rawEventData.eventName);
                console.log(`${SERVICE_NAME} Found ${handlers.size} handler(s) for event ${rawEventData.eventName}`);
                
                // Process handlers sequentially to maintain order
                for (const { handler, appSecretKey, autoAck } of handlers) {
                    // Use an async IIFE to properly handle async operations
                    (async () => {
                        try {
                            // Process the event with the handler-specific key
                            const processedEvent = this.#parseAndDecryptEvent(message, appSecretKey);
                            
                            if (!processedEvent || !processedEvent.payload) {
                                console.error(`${SERVICE_NAME} Failed to process event for handler`);
                                return; // Skip this handler if processing fails
                            }
                            
                            // Call handler and properly await if it returns a Promise
                            console.log(`${SERVICE_NAME} Executing handler for event ${processedEvent.eventName}`);
                            const result = handler(processedEvent);
                            if (result instanceof Promise) {
                                await result.catch(error => {
                                    console.error(`${SERVICE_NAME} Async handler error -`, error);
                                });
                            }
                            console.log(`${SERVICE_NAME} Handler execution completed for event ${processedEvent.eventName}`);
                            
                            // Auto-acknowledge if enabled, AFTER handler completes
                            if (autoAck && processedEvent.idem && processedEvent.block) {
                                try {
                                    await this.#ack(processedEvent.idem, processedEvent.block, processedEvent.eventName);
                                } catch (err) {
                                    console.error(`${SERVICE_NAME} Auto-acknowledge error:`, err);
                                }
                            }
                        } catch (e) {
                            console.error(`${SERVICE_NAME} Event handler error -`, e);
                        }
                    })();
                }
            }
            return;
        }

        // Process response
        if (message.startsWith('+PASS:') || message.startsWith('+REPLAY:') || message.startsWith('-FAIL:')) {
            // Resolve the oldest pending callback
            const entries = Array.from(this.#messageCallbacks.entries());
            if (entries.length > 0) {
                const [callbackId, callback] = entries[0];
                clearTimeout(callback.timeout);
                this.#messageCallbacks.delete(callbackId);
                
                if (message.startsWith('+PASS:') || message.startsWith('+REPLAY:')) {
                    callback.resolve(message);
                } else {
                    callback.reject(new EnSyncError(message.substring(6), "EnSyncError"));
                }
            }
        }

        // Notify message handlers
        this.#eventHandlers.message.forEach(handler => handler(message));
    }

    /**
     * Handles WebSocket errors
     * @private
     */
    #handleError(error) {
        this.#eventHandlers.error.forEach(handler => handler(error));
    }
    
    /**
     * Handles WebSocket close events
     * @private
     * @param {number} code - Close code
     * @param {string} reason - Close reason
     */
    #handleClose(code, reason) {
        this.#state.isConnected = false;
        this.#state.isAuthenticated = false;
        this.#clearTimers();

        console.log(`${SERVICE_NAME} WebSocket closed with code ${code || 'unknown'}, reason: ${reason || 'none provided'}`);
        
        // Clear any pending message callbacks to prevent memory leaks
        this.#messageCallbacks.forEach((callback) => {
            clearTimeout(callback.timeout);
            callback.reject(new EnSyncError('Connection closed', 'EnSyncConnectionError'));
        });
        this.#messageCallbacks.clear();

        // Notify close handlers
        this.#eventHandlers.close.forEach(handler => handler());
        
        // Attempt reconnection if needed
        if (this.#state.shouldReconnect && this.#state.reconnectAttempts < this.#config.maxReconnectAttempts) {
            this.#state.reconnectAttempts++;
            const delay = this.#config.reconnectInterval * Math.pow(1.5, this.#state.reconnectAttempts - 1);
            console.log(`${SERVICE_NAME} Attempting reconnect ${this.#state.reconnectAttempts}/${this.#config.maxReconnectAttempts} in ${delay}ms...`);
            
            this.#state.reconnectTimeout = setTimeout(async () => {
                try {
                    // Use await here to ensure authentication completes
                    await this.connect();
                    
                    // Notify reconnect handlers after successful reconnection
                    this.#eventHandlers.reconnect.forEach(handler => handler());
                } catch (error) {
                    console.error(`${SERVICE_NAME} Reconnection attempt failed:`, error);
                }
            }, delay);
        } else if (this.#state.reconnectAttempts >= this.#config.maxReconnectAttempts) {
            console.error(`${SERVICE_NAME} Maximum reconnection attempts (${this.#config.maxReconnectAttempts}) reached. Giving up.`);
        }
    }

    /**
     * Starts the ping interval
     * @private
     */
    #startPingInterval() {
        this.#clearTimers();
        this.#state.pingTimeout = setInterval(() => {
            if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
                this.#ws.ping();
            }
        }, this.#config.pingInterval);
    }

    /**
     * Handles pong responses
     * @private
     */
    #handlePong() {
        // Reset reconnect counter on successful pong
        this.#state.reconnectAttempts = 0;
    }

    /**
     * Clears all timers
     * @private
     */
    #clearTimers() {
        if (this.#state.pingTimeout) {
            clearInterval(this.#state.pingTimeout);
            this.#state.pingTimeout = null;
        }
        if (this.#state.reconnectTimeout) {
            clearTimeout(this.#state.reconnectTimeout);
            this.#state.reconnectTimeout = null;
        }
    }

    /**
     * Acknowledges a record
     * @param {string} eventIdem - The event identifier (required)
     * @param {string} block - The block identifier (required)
     * @param {string} eventName - The event name (required)
     * @returns {Promise<string>} The acknowledgment response
     * @throws {EnSyncError} If acknowledgment fails or parameters are missing
     */
    async #ack(eventIdem, block, eventName) {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }
        
        try {
            const payload = `ACK;CLIENT_ID=:${this.#config.clientId};EVENT_IDEM=:${eventIdem};BLOCK=:${block};EVENT_NAME=:${eventName}`;
            const data = await this.#sendMessage(payload);
            return data;
        } catch (e) {
            throw new EnSyncError(
                "Failed to acknowledge event. " + e.message,
                "EnSyncGenericError"
            );
        }
    }

    /**
     * Rolls back a record
     * @param {string} eventIdem - The event identifier (required)
     * @param {string} block - The block identifier (required)
     * @returns {Promise<string>} The rollback response
     * @throws {EnSyncError} If rollback fails or required parameters are missing
     */
    async #rollback(eventIdem, block) {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }
        
        try {
            const payload = `ROLLBACK;CLIENT_ID=:${this.#config.clientId};EVENT_IDEM=:${eventIdem};BLOCK=:${block}`;
            const data = await this.#sendMessage(payload);
            return data;
        } catch (e) {
            throw new EnSyncError(
                "Failed to trigger rollback. " + e.message,
                "EnSyncGenericError"
            );
        }
    }
    
    /**
     * Parses and decrypts an event message without triggering handlers
     * @private
     * @param {string} message - The message to parse and decrypt
     * @param {string} [appSecretKey] - Optional app secret key for decryption (overrides client key)
     * @returns {Object} The parsed and decrypted event data
     */
    #parseAndDecryptEvent(message, appSecretKey) {
        // First parse the event message
        const eventData = this.#parseEventMessage(message);
        if (!eventData) return null;
        
        // Then decrypt the payload if present
        if (eventData.encryptedPayload) {
            // Use the provided key or fall back to client's default key
            const decryptionKey = appSecretKey || this.#config.appSecretKey;
            const decryptionResult = this.#decryptPayload(eventData, decryptionKey);
            if (decryptionResult.success) {
                // Add the decrypted payload to the event data
                eventData.payload = decryptionResult.payload;
            } else {
                console.warn(`${SERVICE_NAME} Could not decrypt event payload`);
            }
        }
        
        return eventData;
    }
    
    /**
     * Requests a specific event to be replayed/sent again
     * @param {string} eventIdem - The unique identifier of the event to replay (required)
     * @param {string} eventName - The name of the event to replay (required)
     * @param {string} [appSecretKey] - Optional app secret key for decryption (overrides client key)
     * @returns {Promise<Object>} Response object with status, action, eventIdem, and timestamp
     * @throws {EnSyncError} If replay request fails or required parameters are missing
     */
    async #replay(eventIdem, eventName, appSecretKey) {
        if (!this.#state.isAuthenticated) {
            throw new EnSyncError("Not authenticated", "EnSyncAuthError");
        }
        
        if (!eventIdem) {
            throw new EnSyncError("Event identifier (eventIdem) is required", "EnSyncReplayError");
        }
        
        try {
            const message = `REPLAY;CLIENT_ID=:${this.#config.clientId};EVENT_IDEM=:${eventIdem};EVENT_NAME=:${eventName}`;
            const response = await this.#sendMessage(message);
            
            if (response.startsWith("-FAIL:")) {
                throw new EnSyncError(response.substring(6), "EnSyncReplayError");
            }
            
            // Parse and decrypt the response without triggering handlers
            // Use the subscription-specific appSecretKey if provided
            return this.#parseAndDecryptEvent(response, appSecretKey);
        } catch (error) {
            if (error instanceof EnSyncError) throw error;
            throw new EnSyncError(error, "EnSyncReplayError");
        }
    }

    /**
     * Adds an event listener
     * @param {string} event - Event name ('message', 'error', 'reconnect', 'close')
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
        if (this.#eventHandlers[event]) {
            this.#eventHandlers[event].add(handler);
        }
    }

    /**
     * Removes an event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler to remove
     */
    off(event, handler) {
        if (this.#eventHandlers[event]) {
            this.#eventHandlers[event].delete(handler);
        }
    }
}

module.exports = { EnSyncEngine, EnSyncError };
