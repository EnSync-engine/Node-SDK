const http2 = require("node:http2");
const {
  EnSyncError,
  GENERIC_MESSAGE
} = require("./error")

let RENEW_AT;
let renewTimeout;

const wait = (ms) => {
    return new Promise((resolve) => { setTimeout(resolve, ms) });
}

/**
 * EnSyncEngine is the main class that manages connections and client creation for the EnSync system.
 * It handles secure connections, client renewals, and provides the interface for creating EnSync clients.
 */
class EnSyncEngine {
    #client;
    #config;
    #internalAction;

    /**
     * Creates a new instance of EnSyncEngine
     * @param {string} ensyncURL - The URL of the EnSync server
     * @param {Object} options - Configuration options
     * @param {string} [options.version='v1'] - API version to use
     * @param {boolean} [options.disableTls=false] - Whether to disable TLS verification
     * @param {boolean} [options.ignoreException=false] - Whether to ignore exceptions
     * @param {number} [options.renewAt=420000] - Time in milliseconds before client renewal
     */
    constructor(ensyncURL, {version = "v1", disableTls = false, ignoreException = false, renewAt = 420000}) {
        RENEW_AT = renewAt
        this.#config = {
            version: version,
            clientId: null,
            client: `/http/${version}/client`,
            accessKey: "",
            isSecure: ensyncURL.startsWith("https"),
            ensyncURL
        }

        this.#internalAction = {
            pausePulling: [],
            stopPulling: [],
            endSession: false
        }

        if (this.#config.isSecure) {
            if (disableTls) process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
            this.#client = http2.connect(ensyncURL);
            this.#client.on('error', (err) => { this.#client = http2.connect(ensyncURL) })
        }
    }

    /**
     * Converts a key-value string to an object
     * @private
     * @param {string} data - The data string to convert
     * @param {Object} [options={}] - Conversion options
     * @param {string} [options.startsWith='{'] - Starting character
     * @param {string} [options.endsWith='}'] - Ending character
     * @returns {Object} The converted object
     */
    #convertKeyValueToObject(data, options = {}) {
        const {startsWith = "{", endsWith = "}"} = options
        const convertedRecords = {}
      
        if (!data.length) throw new EnSyncError("No data found", "EnSyncGenericError")
        // Remove the curly braces wrapping the data
        const items = data.startsWith(startsWith) && data.endsWith(endsWith) ? data.substring(1,data.length-1).split(",") : data.split(",")
        items.forEach((item, i) => {
            const [key, value] = item.split("=")
      
            convertedRecords[key.trim()] = value.trim()
        })
        return convertedRecords
    }

    /**
     * Creates a request to the EnSync server
     * @private
     * @param {string} command - The command to send
     * @param {Function} [callback] - Optional callback for streaming responses
     * @returns {Promise<string>} The server response
     */
    async #createRequest(command, callback) {
        let data = '';
        if (this.#config.isSecure) {
            return new Promise((resolved, rejected) => {
                const req = this.#client.request({
                ":path": `/http/${this.#config.version}/client`,
                ':method': 'POST'
                });
        
                req.setEncoding("utf8")
                req.write(command)
        
                req.on('error', rejected).on('response', () => {
                });
        
                req.on('data', async chunk => { 
                    data += chunk;
                    if (callback) await callback(chunk)
                })
                .on('end', () => {
                    if (data.startsWith("-FAIL:"))
                    throw new EnSyncError(data, "EnSyncGenericError")
                    resolved(data);
                });
                req.end()
            })
        } else {
            return new Promise(async (resolved, rejected) => {
                const url = `${this.#config.ensyncURL}/http/${this.#config.version}/client`
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        body: command
                    })
                    const data = await response.text()
                    if (data.startsWith("-FAIL:"))
                        throw new EnSyncError(data, "EnSyncGenericError")
                    
                    if (callback) await callback(chunk)
                    resolved(data);
                } catch(err) {
                    rejected(new EnSyncError(err.message, "EnSyncGenericError"))
                }
            })
        }
    }

    /**
     * Renews the client connection
     * @private
     * @param {string} clientId - The client ID to renew
     * @param {string} accessKey - The access key for authentication
     * @returns {Promise<string>} The renewal response
     */
    async #renewClient(clientId, accessKey) {
        try {
            if (this.#internalAction.endSession) return;
            const payload = `RENEW;CLIENT_ID=${clientId};ACCESS_KEY=${accessKey}`
            const data = await this.#createRequest(payload)
      
            // Convert record to new clientId
            const content = data.replace("+PASS:", "")
            const res = this.#convertKeyValueToObject(content)
      
            this.#config.clientId = res.clientId
      
            renewTimeout = setTimeout(() => this.#renewClient(res.clientId, accessKey), RENEW_AT)
            return data
        } catch (e) {
            throw new EnSyncError(e, "EnSyncConnectionError")
        }
    }

    /**
     * Creates a new EnSync client
     * @param {string} accessKey - The access key for authentication
     * @returns {Promise<EnSyncClient>} A new EnSync client instance
     * @throws {EnSyncError} If client creation fails
     */
    async createClient(accessKey) {
        try {
            const data = await this.#createRequest(`CONN;ACCESS_KEY=${accessKey}`)
            const content = data.replace("+PASS:", "")
            const res = this.#convertKeyValueToObject(content)
            this.#config.clientId = res.clientId
            this.#config.accessKey = accessKey
            
            renewTimeout = setTimeout(() => this.#renewClient(this.#config.clientId, this.#config.accessKey), RENEW_AT)
            return new this.EnSyncClient(this)
        } catch(e) {
            throw new EnSyncError(e, "EnSyncConnectionError")
        }
    }

    /**
     * Closes the engine connection and stops all client operations
     */
    close() {
        this.#internalAction.endSession = true
        if (renewTimeout) clearTimeout(renewTimeout)
        if (this.#config.isSecure) this.#client.close()
    }

    /**
     * EnSyncClient provides the interface for publishing and subscribing to events in the EnSync system.
     * It handles event streaming, record pulling, and acknowledgments.
     */
    EnSyncClient = class {
        #engine;

        /**
         * Creates a new EnSyncClient instance
         * @param {EnSyncEngine} engine - The parent EnSyncEngine instance
         */
        constructor(engine) {
            this.#engine = engine;
        }

        /**
         * Removes an event from the stopped pulling list
         * @private
         * @param {string} eventName - The name of the event to remove
         */
        #removeFromStoppedPullingList(eventName) {
            const toRemove = this.#engine.#internalAction.pausePulling.findIndex(eName => eName === eventName);
            this.#engine.#internalAction.stopPulling.splice(toRemove, 1);
        }

        /**
         * Converts a key-value string to an object
         * @private
         * @param {string} data - The data string to convert
         * @returns {string} The converted string ready for JSON parsing
         */
        #convertKeyValueToObj(data) {
            return data.replace(/(\w+)=/g, '"$1"=').replace(/=(\w+)/g, '="$1"').replaceAll("=", ": ");
        }

        /**
         * Handles pulled records from the server
         * @private
         * @param {string} data - The record data
         * @param {boolean} autoAck - Whether to automatically acknowledge records
         * @param {Function} callback - Callback to handle the record
         */
        async #handlePulledRecords(data, autoAck, callback) {
            if (data.startsWith("-FAIL:")) throw new EnSyncError(data, "EnSyncGenericError");
            if (data.startsWith("+RECORD:")) {
                const content = data.replace("+RECORD:", "");
                const record = JSON.parse(this.#convertKeyValueToObj(content));
                if (record && record.constructor.name == 'Object') {
                    if (record) {
                        await callback(record);
                        if (autoAck) {
                            await this.#ack(record.id, record.block);
                        }
                    }
                }
            }
        }

        /**
         * Streams records for a given event
         * @private
         * @param {string} eventName - The name of the event to stream
         * @param {Object} options - Stream options
         * @param {boolean} [options.autoAck=false] - Whether to auto-acknowledge records
         * @param {Function} callback - Callback to handle streamed records
         */
        async #streamRecords(eventName, options, callback = async () => {}) {
            try {
                if (this.#engine.#internalAction.endSession) return;
                const { autoAck = false } = options;
                this.#engine.#createRequest(
                    `STREAM;CLIENT_ID=${this.#engine.#config.clientId};EVENT_NAME=${eventName}`,
                    async (data) => await this.#handlePulledRecords(data, autoAck, callback)
                );
            } catch (e) {
                throw new EnSyncError(e?.message, "EnSyncGenericError");
            }
        }

        /**
         * Pulls records for a given event
         * @private
         * @param {string} eventName - The name of the event to pull records for
         * @param {Object} options - Pull options
         * @param {boolean} [options.autoAck=true] - Whether to auto-acknowledge records
         * @param {Function} callback - Callback to handle pulled records
         */
        async #pullRecords(eventName, options, callback = async () => {}) {
            try {
                if (this.#engine.#internalAction.endSession) return;
                const { autoAck = true } = options;
                const data = await this.#engine.#createRequest(
                    `PULL;CLIENT_ID=${this.#engine.#config.clientId};EVENT_NAME=${eventName}`
                );
                await this.#handlePulledRecords(data, autoAck, callback);
                await wait(3);
                await this.#pullRecords(eventName, options, callback);
            } catch (e) {
                throw new EnSyncError(e?.message, "EnSyncGenericError");
            }
        }

        /**
         * Acknowledges a record
         * @private
         * @param {string} eventIdem - The event identifier
         * @param {string} block - The block identifier
         * @returns {Promise<string>} The acknowledgment response
         */
        async #ack(eventIdem, block) {
            try {
                const payload = `ACK;CLIENT_ID=${this.#engine.#config.clientId};EVENT_IDEM=${eventIdem};BLOCK=${block}`;
                const data = await this.#engine.#createRequest(payload);
                return data;
            } catch (e) {
                throw new EnSyncError("Failed to acknowledge event. " + GENERIC_MESSAGE, "EnSyncGenericError");
            }
        }

        /**
         * Unsubscribes from an event
         * @private
         * @param {string} eventName - The name of the event to unsubscribe from
         * @returns {Promise<string>} The unsubscribe response
         */
        async #unsubscribe(eventName) {
            const resp = await this.#engine.#createRequest(
                `UNSUB;CLIENT_ID=${this.#engine.#config.clientId};EVENT_NAME=${eventName}`
            );
            this.#engine.#internalAction.stopPulling.push(eventName);
            return resp;
        }

        /**
         * Publishes an event to the EnSync system
         * @param {string} eventName - The name of the event to publish
         * @param {Object} [payload={}] - The event payload
         * @param {Object} [props={}] - Additional properties for the event
         * @returns {Promise<string>} The publish response
         * @throws {EnSyncError} If publishing fails or client is not created
         */
        async publish(eventName, payload = {}, props = {}) {
            if (!this.#engine.#config.clientId)
                throw new EnSyncError("Cannot publish an event when you haven't created a client");
            try {
                return await this.#engine.#createRequest(
                    `PUB;CLIENT_ID=${this.#engine.#config.clientId};EVENT_NAME=${eventName};PAYLOAD=${JSON.stringify(payload)}`
                );
            } catch (e) {
                throw new EnSyncError(e, "EnSyncGenericError");
            }
        }

        /**
         * Subscribes to an event in the EnSync system
         * @param {string} eventName - The name of the event to subscribe to
         * @returns {Promise<Object>} An object containing pull, ack, stream, and unsubscribe methods
         * @throws {EnSyncError} If subscription fails or client is not created
         */
        async subscribe(eventName) {
            try {
                if (!this.#engine.#config.clientId)
                    throw new EnSyncError("Cannot publish an event when you haven't created a client");
                if (!eventName?.trim() && typeof eventName !== "string")
                    throw Error("EventName to subscribe to is not passed");

                this.#removeFromStoppedPullingList(eventName);
                await this.#engine.#createRequest(
                    `SUB;CLIENT_ID=${this.#engine.#config.clientId};EVENT_NAME=${eventName}`
                );
                return {
                    pull: (options, callback) => this.#pullRecords(eventName, options, callback),
                    ack: (eventIdem, block) => this.#ack(eventIdem, block),
                    stream: (options, callback) => this.#streamRecords(eventName, options, callback),
                    unsubscribe: async () => { return await this.#unsubscribe(eventName) }
                };
            } catch (e) {
                throw new EnSyncError(e.message, "EnSyncGenericError");
            }
        }

        /**
         * Closes the client connection
         */
        close() {
            this.#engine.close();
        }
    }
}

module.exports = {
    EnSyncEngine,
    EnSyncError
};
