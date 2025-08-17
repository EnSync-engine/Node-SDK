const http2 = require("node:http2");
const { EnSyncError, GENERIC_MESSAGE } = require("./error");
const naclUtil = require('tweetnacl-util');
const { encryptEd25519, decryptEd25519 } = require('./ecc-crypto');

const SERVICE_NAME = 'EnSync';
let RENEW_AT;

const wait = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/**
 * @typedef {Object} EnSyncConfig
 * @property {string} version - API version
 * @property {string|null} clientId - Client identifier
 * @property {string} client - Client path
 * @property {string} accessKey - Access key for authentication
 * @property {boolean} isSecure - Whether connection is secure
 * @property {string} ensyncURL - EnSync server URL
 */

/**
 * @typedef {Object} EnSyncInternalAction
 * @property {string[]} pausePulling - List of events with paused pulling
 * @property {string[]} stopPulling - List of events with stopped pulling
 * @property {boolean} endSession - Whether session is ended
 */

/**
 * @typedef {Object} EnSyncEngineOptions
 * @property {string} [version='v1'] - API version to use
 * @property {boolean} [disableTls=false] - Whether to disable TLS verification
 * @property {boolean} [ignoreException=false] - Whether to ignore exceptions
 * @property {number} [renewAt=420000] - Time in milliseconds before client renewal
 */

/**
 * @typedef {Object} EnSyncSubscribeOptions
 * @property {boolean} [autoAck=false] - Whether to automatically acknowledge records
 */

/**
 * @typedef {Object} EnSyncRecord
 * @property {string} id - Record identifier
 * @property {string} block - Block identifier
 * @property {*} data - Record data
 */

/**
 * @typedef {Object} EnSyncSubscription
 * @property {function(EnSyncSubscribeOptions, function(EnSyncRecord): Promise<void>): void} pull - Pull records from subscription
 * @property {function(string, string): Promise<string>} ack - Acknowledge a record
 * @property {function(string, string): Promise<string>} rollback - Rollback a record
 * @property {function(EnSyncSubscribeOptions, function(EnSyncRecord): Promise<void>): void} stream - Stream records from subscription
 * @property {function(): Promise<string>} unsubscribe - Unsubscribe from events
 */

/**
 * @typedef {Object} EnSyncCommandResponse
 * @property {string} clientId - Client identifier returned from server
 * @property {string} [status] - Response status
 * @property {string} [message] - Response message
 * @property {string} [error] - Error message if any
 */

/**
 * @typedef {Object} EnSyncEventPayload
 * @property {string} [id] - Event identifier
 * @property {string} [block] - Block identifier
 * @property {string} [name] - Event name
 * @property {Object} [data] - Event data
 * @property {number} [timestamp] - Event timestamp
 * @property {Object} [header] - Additional header
 */

/**
 * @typedef {Object} EnSyncPublishOptions
 * @property {boolean} [persist=true] - Whether to persist the event
 * @property {Object} [headers] - Additional headers
 */

/**
 * EnSyncEngine is the main class that manages connections and client creation for the EnSync system.
 * It handles secure connections, client renewals, and provides the interface for creating EnSync clients.
 * @implements {EventTarget}
 */
class EnSyncEngine {
  /** @type {http2.ClientHttp2Session} */
  #client;
  /** @type {EnSyncConfig} */
  #config;
  /** @type {EnSyncInternalAction} */
  #internalAction;

  /**
   * Creates a new instance of EnSyncEngine
   * @param {string} ensyncURL - The URL of the EnSync server
   * @param {EnSyncEngineOptions} options - Configuration options
   * @fires EnSyncEngine#error - When an error occurs
   * @fires EnSyncEngine#connect - When connection is established
   * @fires EnSyncEngine#disconnect - When connection is closed
   */
  constructor(ensyncURL, { version = "v1", useHttp1 = false, disableTls = false, ignoreException = false, renewAt = 320000 }) {
    RENEW_AT = renewAt;
    this.#config = {
      version: version,
      clientId: null,
      clientHash: null,
      client: `/http/${version}/client`,
      accessKey: "",
      isSecure: !useHttp1 && ensyncURL.startsWith("https"),
      ensyncURL,
    };

    this.#internalAction = {
      pausePulling: [],
      stopPulling: [],
      endSession: false,
    };

    if (this.#config.isSecure) {
      if (disableTls) process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
      this.#connectWithRetry(ensyncURL);
    }
  }

  /**
   * Converts a key-value string to an object
   * @private
   * @param {string} data - The data string to convert
   * @param {Object} [options={}] - Conversion options
   * @param {string} [options.startsWith='{'] - Starting character
   * @param {string} [options.endsWith='}'] - Ending character
   * @returns {Object.<string, string>} The converted object
   */
  #convertKeyValueToObject(data, options = {}) {
    const { startsWith = "{", endsWith = "}" } = options;
    const convertedRecords = {};

    if (!data.length) throw new EnSyncError("No data found", "EnSyncGenericError");
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

  /**
   * Creates a request to the EnSync server
   * @private
   * @param {string} command - The command to send
   * @param {function(string): Promise<void>} [callback] - Optional callback for streaming responses
   * @returns {Promise<EnSyncCommandResponse>} The server response
   * @throws {EnSyncError} If request fails
   * @emits EnSyncEngine#request
   * @emits EnSyncEngine#response
   */
  /**
   * Establishes HTTP/2 connection with retry logic
   * @private
   * @param {string} url - The URL to connect to
   */
  #connectWithRetry(url) {
    try {
      this.#client = http2.connect(url);
      this.#client.on("error", (err) => {
        console.log(`${SERVICE_NAME}: Connection error:`, err);
        if (!this.#internalAction.endSession) {
          setTimeout(() => this.#connectWithRetry(url), 1000); // Retry after 1 second
        }
      });

      this.#client.on("close", () => {
        if (!this.#internalAction.endSession) {
          setTimeout(() => this.#connectWithRetry(url), 1000); // Retry after 1 second
        }
      });
    } catch (err) {
      console.log(`${SERVICE_NAME}: Failed to establish connection:`, err);
      if (!this.#internalAction.endSession) {
        setTimeout(() => this.#connectWithRetry(url), 1000); // Retry after 1 second
      }
    }
  }

  async #createRequest(command, callback) {
    let data = "";
    if (this.#config.isSecure) {
      return new Promise((resolved, rejected) => {
        const makeRequest = () => {
          try {
            const req = this.#client.request({
              ":path": `/http/${this.#config.version}/client`,
              ":method": "POST",
            });

            req.setEncoding("utf8");
            req.write(command);

            req.on("error", (err) => {
              if (err.code === 'ERR_HTTP2_STREAM_CANCEL') {
                // Retry the request after a short delay
                setTimeout(() => makeRequest(), 100);
              } else {
                rejected(err);
              }
            });

            req.on("response", () => {});

            req
              .on("data", async (chunk) => {
                data += chunk;
                if (callback) await callback(chunk);
              })
              .on("end", () => {
                if (data.startsWith("-FAIL:")) throw new EnSyncError(data, "EnSyncGenericError");
                resolved(data);
              });
            req.end();
          } catch (err) {
            if (err.code === 'ERR_HTTP2_STREAM_CANCEL') {
              // Retry the request after a short delay
              setTimeout(() => makeRequest(), 100);
            } else {
              rejected(err);
            }
          }
        };

        makeRequest();
      });
    } else {
      return new Promise(async (resolved, rejected) => {
        const url = `${this.#config.ensyncURL}/http/${this.#config.version}/client`;
        try {
          const response = await fetch(url, {
            method: "POST",
            body: command,
          });
          const data = await response.text();
          if (data.startsWith("-FAIL:")) throw new EnSyncError(data, "EnSyncGenericError");

          if (callback) await callback(chunk);
          resolved(data);
        } catch (err) {
          console.log(`${SERVICE_NAME}: err`, err);
          rejected(new EnSyncError(err.message, "EnSyncGenericError"));
        }
      });
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
      const data = await this.#createRequest(`CONN;ACCESS_KEY=:${accessKey}`);
      const content = data.replace("+PASS:", "");
      const res = this.#convertKeyValueToObject(content);
      this.#config.clientId = res.clientId;
      this.#config.accessKey = accessKey;
      this.#config.clientHash = res.clientHash;

      return new this.EnSyncClient(this);
    } catch (e) {
      console.log("\ne---", e);
      throw new EnSyncError(e, "EnSyncConnectionError");
    }
  }

  /**
   * Closes the engine connection and stops all client operations
   */
  close() {
    this.#internalAction.endSession = true;
    if (this.#config.isSecure) this.#client.close();
  }

  /**
   * EnSyncClient provides the interface for publishing and subscribing to events in the EnSync system.
   * It handles event streaming, record pulling, and acknowledgments.
   * @implements {EventTarget}
   */
  EnSyncClient = class {
    /** @type {EnSyncEngine} */
    #engine;
    /** @type {NodeJS.Timeout} */
    #renewTimeout;

    /**
     * Creates a new EnSyncClient instance
     * @param {EnSyncEngine} engine - The parent EnSyncEngine instance
     * @fires EnSyncClient#connect - When client is connected
     * @fires EnSyncClient#disconnect - When client is disconnected
     * @fires EnSyncClient#error - When an error occurs
     */
    constructor(engine) {
      this.#engine = engine;
      this.#renewTimeout = setTimeout(
        () => this.#renewClient(this.#engine.#config.clientId, this.#engine.#config.accessKey),
        RENEW_AT
      );
    }

    /**
     * Renews the client connection
     * @private
     * @param {string} clientId - The client ID to renew
     * @param {string} accessKey - The access key for authentication
     * @returns {Promise<string>} The renewal response
     * @throws {EnSyncError} If renewal fails
     */
    async #renewClient(clientId, accessKey) {
      try {
        if (this.#engine.#internalAction.endSession) return;
        const payload = `RENEW;CLIENT_ID=:${clientId};ACCESS_KEY=:${accessKey}`;
        const data = await this.#engine.#createRequest(payload);

        // Convert record to new clientId
        const content = data.replace("+PASS:", "");
        const res = this.#engine.#convertKeyValueToObject(content);

        this.#engine.#config.clientId = res.clientId;

        this.#renewTimeout = setTimeout(() => this.#renewClient(res.clientId, accessKey), RENEW_AT);
        return data;
      } catch (e) {
        throw new EnSyncError(e, "EnSyncConnectionError");
      }
    }

    /**
     * Removes an event from the stopped pulling list
     * @private
     * @param {string} eventName - The name of the event to remove
     */
    #removeFromStoppedPullingList(eventName) {
      const toRemove = this.#engine.#internalAction.pausePulling.findIndex(
        (eName) => eName === eventName
      );
      this.#engine.#internalAction.stopPulling.splice(toRemove, 1);
    }

    /**
     * Converts a key-value string to an object
     * @private
     * @param {string} data - The data string to convert
     * @returns {string} The converted string ready for JSON parsing
     */
    #convertKeyValueToObj(data) {
      return data
        .replace(/=(\w+)/g, ': $1')
        .replace(/(\w+=*)/g, '"$1"')
    }

    /**
     * Handles pulled records from the server
     * @private
     * @param {string} data - The record data
     * @param {boolean} autoAck - Whether to automatically acknowledge records
     * @param {function(EnSyncRecord): Promise<void>} callback - Callback to handle the record
     * @throws {EnSyncError} If record handling fails
     */
    async #handlePulledRecords(data, decryptionKey, autoAck, callback) {
      if (data.startsWith("-FAIL:")) throw new EnSyncError(data, "EnSyncGenericError");
      if (data.startsWith("+RECORD:")) {
        const content = data.replace("+RECORD:", "");
        const record = JSON.parse(this.#convertKeyValueToObj(content));
        if (record && record.constructor.name == "Object") {
          if (record) {
            const decodedPayloadJson = Buffer.from(record.payload, 'base64').toString('utf8');
            const encryptedPayload = JSON.parse(decodedPayloadJson);
            await callback({
              ...record,
              payload: JSON.parse(decryptEd25519(encryptedPayload, naclUtil.decodeBase64(decryptionKey)))
            });
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
     * @param {EnSyncSubscribeOptions} options - Stream options
     * @param {function(EnSyncRecord): Promise<void>} [callback] - Callback to handle streamed records
     * @throws {EnSyncError} If streaming fails
     */
    async #streamRecords(eventName, options, decryptionKey, callback = async () => {}) {
      try {
        if (this.#engine.#internalAction.endSession) return;
        const { autoAck = false } = options;
        this.#engine.#createRequest(
          `STREAM;CLIENT_ID=:${this.#engine.#config.clientId};EVENT_NAME=:${eventName}`,
          async (data) => await this.#handlePulledRecords(data, decryptionKey, autoAck, callback)
        );
      } catch (e) {
        throw new EnSyncError(e?.message, "EnSyncGenericError");
      }
    }

    /**
     * Pulls records for a given event
     * @private
     * @param {string} eventName - The name of the event to pull records for
     * @param {EnSyncSubscribeOptions} options - Pull options
     * @param {function(EnSyncRecord): Promise<void>} [callback] - Callback to handle pulled records
     * @throws {EnSyncError} If pulling fails
     */
    async #pullRecords(eventName, options, decryptionKey, callback = async () => {}) {
      try {
        if (this.#engine.#internalAction.endSession) return;
        const { autoAck = true } = options;
        const data = await this.#engine.#createRequest(
          `PULL;CLIENT_ID=:${this.#engine.#config.clientId};EVENT_NAME=:${eventName}`
        );
        await this.#handlePulledRecords(data, decryptionKey, autoAck, callback);
        await wait(3);
        await this.#pullRecords(eventName, options, decryptionKey, callback);
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
     * @throws {EnSyncError} If acknowledgment fails
     */
    async #ack(eventIdem, block) {
      try {
        const payload = `ACK;CLIENT_ID=:${this.#engine.#config.clientId};EVENT_IDEM=:${eventIdem};BLOCK=:${block}`;
        const data = await this.#engine.#createRequest(payload);
        return data;
      } catch (e) {
        throw new EnSyncError(
          "Failed to acknowledge event. " + GENERIC_MESSAGE,
          "EnSyncGenericError"
        );
      }
    }

    /**
     * Rolls back a record
     * @private
     * @param {string} eventIdem - The event identifier
     * @param {string} block - The block identifier
     * @returns {Promise<string>} The rollback response
     * @throws {EnSyncError} If rollback fails
     */
    async #rollBack(eventIdem, block) {
      try {
        return await this.#engine.#createRequest(
          `ROLLBACK;CLIENT_ID=:${this.#engine.#config.clientId};EVENT_IDEM=:${eventIdem};BLOCK=:${block}`
        );
      } catch (e) {
        throw new EnSyncError("Failed to trigger rollBack. " + GENERIC_MESSAGE, "EnSyncGenericError");
      }
    }

    /**
     * Unsubscribes from an event
     * @private
     * @param {string} eventName - The name of the event to unsubscribe from
     * @returns {Promise<string>} The unsubscribe response
     * @throws {EnSyncError} If unsubscribe fails
     */
    async #unsubscribe(eventName) {
      const resp = await this.#engine.#createRequest(
        `UNSUB;CLIENT_ID=:${this.#engine.#config.clientId};EVENT_NAME=:${eventName}`
      );
      this.#engine.#internalAction.stopPulling.push(eventName);
      return resp;
    }

    /**
     * Publishes an event to the EnSync system
     * @param {string} eventName - The name of the event to publish
     * @param {*} [payload={}] - The event payload (user-defined data structure)
     * @param {EnSyncPublishOptions} [metadata={}] - Additional metadata for the event
     * @returns {Promise<EnSyncCommandResponse>} The publish response
     * @throws {EnSyncError} If publishing fails or client is not created
     * @fires EnSyncClient#publish
     * @example
     * ```javascript
     * const client = await engine.createClient('your-access-key');
     * // Payload is user-defined
     * await client.publish('power-usage', {
     *   current: 100,
     *   unit: 'kWh',
     *   timestamp: Date.now(),
     *   source: 'power-meter-1'
     * });
     * ```
     */

    async publish(eventName, recipients, payload = {}, metadata = {persist: true, headers: {}}) {
      if (!this.#engine.#config.clientId)
        throw new EnSyncError("Cannot publish an event when you haven't created a client");

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
          const response = await this.#engine.#createRequest(
            `PUB;CLIENT_ID=:${this.#engine.#config.clientId};EVENT_NAME=:${eventName};PAYLOAD=:${encryptedBase64};DELIVERY_TO=:${recipient};METADATA=:${JSON.stringify(metadata)}`
          );
          responses.push(response);
        }
        return responses.join(',');
      } catch (e) {
        throw new EnSyncError(e, "EnSyncGenericError");
      } 
    }

    /**
     * Subscribes to an event in the EnSync system
     * @param {string} eventName - The name of the event to subscribe to
     * @returns {Promise<EnSyncSubscription>} An object containing pull, ack, rollback, stream, and unsubscribe methods
     * @throws {EnSyncError} If subscription fails or client is not created
     * @fires EnSyncClient#subscribe
     * @fires EnSyncClient#message
     * @example
     * ```javascript
     * const subscription = await client.subscribe('power-usage');
     * subscription.pull({ autoAck: true }, async (record) => {
     *   console.log('Received record:', record);
     *   // Process the record
     *   await subscription.ack(record.id, record.block);
     * });
     * ```
     */
    async subscribe(eventName, appSecretKey) {
      try {
        if (!this.#engine.#config.clientId)
          throw new EnSyncError("Cannot subscribe an event when you haven't created a client");
        if (!eventName?.trim() && typeof eventName !== "string")
          throw Error("EventName to subscribe to is not passed");

        this.#removeFromStoppedPullingList(eventName);

        await this.#engine.#createRequest(
          `SUB;CLIENT_ID=:${this.#engine.#config.clientId};EVENT_NAME=:${eventName}`
        );

        return {
          pull: (options, callback) => this.#pullRecords(eventName, options, appSecretKey, callback),
          ack: (eventIdem, block) => this.#ack(eventIdem, block),
          rollback: (eventIdem, block) => this.#rollBack(eventIdem, block),
          stream: (options, callback) => this.#streamRecords(eventName, options, appSecretKey, callback),
          unsubscribe: async () => {
            return await this.#unsubscribe(eventName);
          },
        };
      } catch (e) {
        throw new EnSyncError(e.message, "EnSyncGenericError");
      }
    }

    /**
     * Destroys the client connection and optionally stops the engine
     * @param {boolean} [stopEngine=false] - If true, also closes the underlying engine connection.
     *                                      Set to false to keep the engine running for other clients.
     * @returns {Promise<void>}
     * @throws {EnSyncError} If client destruction fails
     * @fires EnSyncClient#destroy
     */
    async destroy(stopEngine = false) {
      await this.#engine.#createRequest(`CLOSE;CLIENT_ID=:${this.#engine.#config.clientId}`);
      if (this.#renewTimeout) clearTimeout(this.#renewTimeout);
      if (stopEngine) this.#engine.close();
    }
  };
}

module.exports = {
  EnSyncEngine,
  EnSyncError,
};
