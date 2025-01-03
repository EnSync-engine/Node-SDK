const http2 = require("node:http2");
const {
 EnSyncError,
 GENERIC_MESSAGE
} = require("./error")

const RENEW_AT = 420000
let renewTimeout;

class EnSyncEngine {
    #client;
    #config;
    #internalAction;

   constructor(host, port, {version = "v1", disableTls = false}) {
      if (disableTls) process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
      this.#config = {
       version: version,
       clientId: null,
       accessKey: ""
      }
      this.#internalAction = {
          pausePulling: [],
          stopPulling: [],
          endSession: false
      }

      this.#client = http2.connect(`https://${host}:${port}`);
      this.#client.on('error', (err) => {throw new EnSyncError(err)})
    }

    #removeFromStoppedPullingList (eventName) {
     const toRemove = this.#internalAction.pausePulling.findIndex(eName => eName === eventName)
     this.#internalAction.stopPulling.splice(toRemove, 1)
    }

   #convertKeyValueToObject(data, options = {}) {
    const {startsWith = "{", endsWith = "}"} = options
    const convertedRecords = {}
    // Remove the curly braces wrapping the data
    const items = data.startsWith(startsWith) && data.endsWith(endsWith) ? data.substring(1,data.length-1).split(",") : data.split(",")
    items.forEach((item, i) => {
        const [key, value] = item.split("=")

        convertedRecords[key.trim()] = value.trim()
    })
    return convertedRecords
   }

   #convertKeyValueToObj (data) {
       return data.replace(/(\w+)=/g, '"$1"=').replace(/=(\w+)/g, '="$1"').replaceAll("=", ": ")
   }

   #createRequest(command, callback) {
    let data = '';

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
   }

   async createClient (accessKey) {
    try {
        const data = await this.#createRequest(`CONN;ACCESS_KEY=${accessKey}`)
        const content = data.replace("+PASS:", "")
        const res = this.#convertKeyValueToObject(content)
        this.#config.clientId = res.clientId
        this.#config.accessKey = accessKey
        
        renewTimeout = setTimeout(() => this.#reconnect(this.#config.clientId, this.#config.accessKey), RENEW_AT)
        return this
    } catch(e) {
      throw new EnSyncError(e, "EnSyncConnectionError")
    }
   }

   async #reconnect (clientId, accessKey) {
    try {
        if (this.#internalAction.endSession) return;
        const payload = `RENEW;CLIENT_ID=${clientId};ACCESS_KEY=${accessKey}`
        const data = await this.#createRequest(payload)

        // Convert record to new clientId
        const content = data.replace("+PASS:", "")
        const res = this.#convertKeyValueToObject(content)

        this.#config.clientId = res.clientId

        renewTimeout = setTimeout(() => this.#reconnect(res.clientId, accessKey), RENEW_AT)
        return data
    } catch (e) {
     throw new EnSyncError(e, "EnSyncConnectionError")
    }
   }

   async publish (eventName, payload = {}) {
    if (!this.#config.clientId) throw new EnSyncError("Cannot publish an event when you haven't created a client")
    try {
        return await this.#createRequest(`PUB;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName};PAYLOAD=${JSON.stringify(payload)}`)
    } catch (e) {
        throw new EnSyncError(e, "EnSyncGenericError")
    }
   }

   async subscribe (eventName) {
    try {
        if (!this.#config.clientId) throw new EnSyncError("Cannot publish an event when you haven't created a client")
        if (!eventName.trim() && typeof eventName !== "string") throw Error("EventName to subscribe to is not passed")

         // Let's ensure this eventName is not in the stopped list
         this.#removeFromStoppedPullingList(eventName)
        await this.#createRequest(`SUB;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName}`)
        return {
            pull: (options, callback) => this.#pullRecords(eventName, options, callback),
            stream: (options, callback) => this.#streamRecords(eventName, options, callback),
            unsubscribe: async () => {return await this.#unsubscribe(eventName)}
        }
    } catch (e) {
        throw new EnSyncError(e.message, "EnSyncGenericError")
    }
   }

   async #handlePulledRecords (data, autoAck, callback) {
    if (data.startsWith("-FAIL:")) throw new EnSyncError(data, "EnSyncGenericError")
    // // Means there's no record to pull
    if (data.startsWith("+RECORD:")) {
      // Remove response starter so we can be left with the actual data
      const content = data.replace("+RECORD:", "")
      const record = JSON.parse(this.#convertKeyValueToObj(content))
      if (record && record.constructor.name == 'Object') {
          if (record) {
              await callback(record)
              if (autoAck) {
                  await this.ack(record.id, record.block)
              }
          }
      }
    }
  }

   async #streamRecords (eventName, options, callback = async () => {}) {
    try {
        if (this.#internalAction.endSession) return;
        const {autoAck = false} = options
        this.#createRequest(`STREAM;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName}`, async (data) => this.#handlePulledRecords(data, autoAck, callback))
    } catch (e) {
        throw new  EnSyncError(e?.message, "EnSyncGenericError")
    }
   }

   async #pullRecords (eventName, options, callback = async () => {}) {
    try {
        if (this.#internalAction.endSession) return;
        const {autoAck = false} = options
        const data = await this.#createRequest(`PULL;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName}`)
        await this.#handlePulledRecords(data, autoAck, callback)
        this.#pullRecords(eventName, options, callback)
    } catch (e) {
        throw new  EnSyncError(e?.message, "EnSyncGenericError")
    }
   }

   async ack (eventIdem, block) {
    try {
        const payload = `ACK;CLIENT_ID=${this.#config.clientId};EVENT_IDEM=${eventIdem};BLOCK=${block}`
        const data = await this.#createRequest(payload)
        return data
    } catch (e) {
        throw new EnSyncError("Failed to acknowledge event. " + GENERIC_MESSAGE, "EnSyncGenericError")
    }
   }

   async #unsubscribe (eventName) {
    const resp = await this.#createRequest(`UNSUB;CLIENT_ID=${this.#config.clientId};EVENT_NAME=${eventName}`)
    this.#internalAction.stopPulling.push(eventName)
    return resp
   }

   close () {
    this.#internalAction.endSession = true
    if (renewTimeout) clearTimeout(renewTimeout)
    this.#client.close()
   }
}


module.exports = {
 EnSyncEngine,
 EnSyncError
};
