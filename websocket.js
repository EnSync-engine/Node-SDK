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
     * Subscribes to an event
     * @param {string} eventName - Name of the event to subscribe to
     * @returns {Promise<void>}
     * @throws {EnSyncError} If subscription fails
     */
    async subscribe(eventName, options = {autoAck: false, appSecretKey: null}) {
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
                ack: (eventIdem, block, eventName) => this.#ack(eventIdem, block, eventName),
                rollback: (eventIdem, block) => this.#rollback(eventIdem, block),
                unsubscribe: async () => this.#unsubscribe(eventName)
            };
        } else {
            throw new EnSyncError(`Subscription failed: ${response}`, "EnSyncSubscriptionError");
        }
    }

    /**
     * Adds an event handler for a subscribed event
     * @param {string} eventName - Name of the event
     * @param {Function} handler - Event handler function
     * @param {string} appSecretKey - App secret key for authentication
     * @returns {Function} Unsubscribe function
     */
    #on(eventName, handler, appSecretKey, autoAck = false) {
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
     * Parses an event message
     * @private
     */
    #parseEventMessage(message) {
        try {
            if (message.startsWith("-FAIL:")) throw new EnSyncError(message, "EnSyncGenericError");
            if (!message.startsWith("+RECORD:")) return null;

            const content = message.replace("+RECORD:", "");
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
                    idem: record.id,
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

            // Resubscribe to events after successful authentication
            const currentSubscriptions = Array.from(this.#subscriptions.keys());
            for (const eventName of currentSubscriptions) {
                await this.subscribe(eventName).catch(console.error);
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
            const eventData = this.#parseEventMessage(message);
            if (eventData && this.#subscriptions.has(eventData.eventName)) {
                const handlers = this.#subscriptions.get(eventData.eventName);
                handlers.forEach(({ handler, appSecretKey, autoAck }) => {
                    try {
                        // Use subscription key if available, otherwise fall back to client key
                        const decryptionKey = appSecretKey || this.#config.appSecretKey || this.#config.clientHash;
                        let finalPayload;
                        try {
                            finalPayload = JSON.parse(decryptEd25519(eventData.encryptedPayload, decryptionKey));
                        } catch (decryptError) {
                            console.error(`${SERVICE_NAME} Failed to decrypt with key -`, decryptError);
                            return; // Skip this handler if decryption fails
                        }
                        // Remove encryptedPayload from eventData
                        delete eventData.encryptedPayload;
                        handler({ ...eventData, payload: finalPayload });
                        
                        // Auto-acknowledge if enabled
                        if (autoAck && eventData.idem && eventData.block) {
                            this.#ack(eventData.idem, eventData.block).catch(err => {
                                console.error(`${SERVICE_NAME} Auto-acknowledge error:`, err);
                            });
                        }
                    } catch (e) {
                        console.error(`${SERVICE_NAME} Event handler error -`, e);
                    }
                });
            }
            return;
        }

        // Process response
        if (message.startsWith('+PASS:') || message.startsWith('-FAIL:')) {
            // Resolve the oldest pending callback
            const [callbackId, callback] = Array.from(this.#messageCallbacks.entries())[0];
            if (callback) {
                clearTimeout(callback.timeout);
                this.#messageCallbacks.delete(callbackId);
                
                if (message.startsWith('+PASS:')) {
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
            
            this.#state.reconnectTimeout = setTimeout(() => {
                this.connect().catch(error => {
                    console.error(`${SERVICE_NAME} Reconnection attempt failed:`, error);
                });
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
     * @param {string} eventIdem - The event identifier
     * @param {string} block - The block identifier
     * @returns {Promise<string>} The acknowledgment response
     * @throws {EnSyncError} If acknowledgment fails
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
            console.log("ACK Error", e);
            throw new EnSyncError(
                "Failed to acknowledge event. " + GENERIC_MESSAGE,
                "EnSyncGenericError"
            );
        }
    }

    /**
     * Rolls back a record
     * @param {string} eventIdem - The event identifier
     * @param {string} block - The block identifier
     * @returns {Promise<string>} The rollback response
     * @throws {EnSyncError} If rollback fails
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
                "Failed to trigger rollback. " + GENERIC_MESSAGE,
                "EnSyncGenericError"
            );
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
