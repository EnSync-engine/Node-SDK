const {
  EnSyncError,
  GENERIC_MESSAGE
} = require("./error")



class EnSyncClient {
  #config;
  #internalAction;
  #createRequest;

  constructor(config, internalAction, createRequest) {
    this.#createRequest = createRequest;
    this.#config = config;
    this.#internalAction = internalAction;
  }

  #removeFromStoppedPullingList(eventName) {
    const toRemove = this.#internalAction.pausePulling.findIndex(eName => eName === eventName);
    this.#internalAction.stopPulling.splice(toRemove, 1);
  }

  #convertKeyValueToObj(data) {
    return data.replace(/(\w+)=/g, '"$1"=').replace(/=(\w+)/g, '="$1"').replaceAll("=", ": ");
  }

  async #handlePulledRecords(data, autoAck, callback) {
    if (data.startsWith("-FAIL:")) throw new EnSyncError(data, "EnSyncGenericError");
    // Means there's no record to pull
    if (data.startsWith("+RECORD:")) {
      // Remove response starter so we can be left with the actual data
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

  async #streamRecords(eventName, options, callback = async () => {}) {
    try {
      if (this.#internalAction.endSession) return;
      const { autoAck = false } = options;
      this.#createRequest(`STREAM;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName}`, 
        async (data) => await this.#handlePulledRecords(data, autoAck, callback));
    } catch (e) {
      throw new EnSyncError(e?.message, "EnSyncGenericError");
    }
  }

  async #pullRecords(eventName, options, callback = async () => {}) {
    try {
      if (this.#internalAction.endSession) return;
      const { autoAck = true } = options;
      const data = await this.#createRequest(`PULL;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName}`);
      await this.#handlePulledRecords(data, autoAck, callback);
      await wait(3);
      await this.#pullRecords(eventName, options, callback);
    } catch (e) {
      throw new EnSyncError(e?.message, "EnSyncGenericError");
    }
  }

  async #ack(eventIdem, block) {
    try {
      const payload = `ACK;CLIENT_ID=${this.#config.clientId};EVENT_IDEM=${eventIdem};BLOCK=${block}`;
      const data = await this.#createRequest(payload);
      return data;
    } catch (e) {
      throw new EnSyncError("Failed to acknowledge event. " + GENERIC_MESSAGE, "EnSyncGenericError");
    }
  }

  async #unsubscribe(eventName) {
    const resp = await this.#createRequest(`UNSUB;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName}`);
    this.#internalAction.stopPulling.push(eventName);
    return resp;
  }

  async publish(eventName, payload = {}, props = {}) {
   console.log("this.#config", this.#config)
    if (!this.#config.clientId) throw new EnSyncError("Cannot publish an event when you haven't created a client");
    try {
      return await this.#createRequest(`PUB;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName};PAYLOAD=${JSON.stringify(payload)}`);
    } catch (e) {
      throw new EnSyncError(e, "EnSyncGenericError");
    }
  }

  async subscribe(eventName) {
    try {
      if (!this.#config.clientId) throw new EnSyncError("Cannot publish an event when you haven't created a client");
      if (!eventName?.trim() && typeof eventName !== "string") throw Error("EventName to subscribe to is not passed");

      // Let's ensure this eventName is not in the stopped list
      this.#removeFromStoppedPullingList(eventName);
      await this.#createRequest(`SUB;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName}`);
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
}

module.exports = {
  EnSyncClient,
};