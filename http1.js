const axios = require('axios');

const GENERIC_MESSAGE = "Verify your EnSync engine is still operating"
const GENERAL_RESPONSE = "Failed to establish a connection with an EnSync engine"
class EnSyncError extends Error {
    constructor(e = "", name="EnSyncGenericError", ...args) {
        let msg;
        if (e.constructor.name === "String") msg = e
        else if (e.response) msg = e.response.data
        else if (e.name == "AggregateError" || e.name == "AxiosError") msg = GENERAL_RESPONSE
        else if (!e.response) msg = e.message
        super(msg, ...args)
        this.name = name;
        this.message = msg;
    }
}
const wait = (ms) => {
    return new Promise( (resolve) => {setTimeout(resolve, ms)});
}

class EnSyncEngine {
    constructor(host, port, version = "v1") {
        this.config = {
            url: `http://${host}:${port}/http/${version}/client`,
            clientId: null,
            accessKey: ""
        }
        this.internalAction = {
            pausePulling: [],
            stopPulling: []
        }
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

    async createClient (accessKey) {
        try {
            const {data} = await axios.post(this.config.url, `CONN;ACCESS_KEY=${accessKey}`)
            if (data.startsWith("-FAIL:"))
                throw EnSyncError(data, "EnSyncGenericError")

            const content = data.replace("+PASS:", "")
            const resp = this.#convertKeyValueToObject(content)
            this.config.clientId = resp.clientId
            this.config.accessKey = accessKey
            
            return this
        } catch(e) {
            throw new EnSyncError(e, "EnSyncConnectionError")
        }
    }
    async publishEvent (eventName, payload = {}) {
        if (!this.config.clientId) throw Error("Cannot publish an event when you haven't created a client")
        try {
            const sentPayload = `PUB;CLIENT_ID=${this.config.clientId};EVENT_NAME=${eventName};PAYLOAD=${JSON.stringify(payload)}`
            const {data} = await axios.post(this.config.url,sentPayload)
            if (data.startsWith("-FAIL:"))
                throw new EnSyncError(data, "EnSyncGenericError")
            return data
        } catch (e) {
            throw new EnSyncError(GENERAL_RESPONSE, "EnSyncGenericError")
        }
    }

    stopSubscription () {
        this.internalAction.stopPulling = true
    }

    pausePulling (eventName) {
        this.internalAction.pausePulling.push(eventName)
    }

    resumePulling (eventName) {
        const toRemove = this.internalAction.pausePulling.findIndex(eName => eName === eventName)
        this.internalAction.pausePulling.splice(toRemove, 1)
    }

    async #pullRecords (eventName, options, callback = async () => {}) {
        try {
            const {autoAck = false, delayTillNext = 10} = options
            if (!this.internalAction.pausePulling.includes(eventName)) {
                const decryptedData = await this.#startPullingForRecords(eventName)
                if (decryptedData && decryptedData.constructor.name == 'Array') {
                    const [record] = decryptedData
                    if (record) {
                        await callback(record)
                        if (autoAck) {
                            await this.#ack(record.id, record.block)
                        }
                    }
                }
                await wait(delayTillNext)
                this.#pullRecords(eventName, options, callback)
            }
        } catch (e) {
            throw new  EnSyncError(e?.message, "EnSyncGenericError")
        }
    };

    async subscribeEvent (eventName, options = {}) {
        try {
            const {subscribeOnly =  false} = options
            if (!this.config.clientId) throw Error("Cannot publish an event when you haven't created a client")
            if (!eventName.trim() && typeof eventName !== "string") throw Error("EventName to subscribe to not passed")
            const sentPayload = `SUB;CLIENT_ID=${this.config.clientId};EVENT_NAME=${eventName}`
    
            await axios.post(this.config.url,sentPayload)
            return {
                pull: (options, callback) => this.#pullRecords(eventName, options, callback)
            }
        } catch (e) {
            throw new EnSyncError(e.message, "EnSyncGenericError")
        }
    }

    async ack (id, block) {
        return await this.#ack(id, block)
    }

    async rollbackClientPosition (id, block) {
        return await this.#rollBack(id, block)
    }

    async #startPullingForRecords (eventName) {
        try {
            const pullPayload = `PULL;CLIENT_ID=${this.config.clientId};EVENT_NAME=${eventName}`
            const {data} = await axios.post(this.config.url,pullPayload)
            if (data.startsWith("-FAIL:"))
                throw new EnSyncError(data, "EnSyncGenericError")
    
            const content = data.replace("+PASS:", "")
            return JSON.parse(this.#convertKeyValueToObj(content))
        } catch (e) {
            throw new EnSyncError("Failed to pull event. " + GENERIC_MESSAGE, "EnSyncGenericError")
        }
    }

    async #ack (eventIdem, block) {
        try {
            const sentPayload = `ACK;CLIENT_ID=${this.config.clientId};EVENT_IDEM=${eventIdem};BLOCK=${block}`
            const {data} = await axios.post(this.config.url,sentPayload)
            if (data.startsWith("-FAIL:"))
                throw new EnSyncError(data, "EnSyncGenericError")
            
            return data
        } catch (e) {
            throw new EnSyncError("Failed to acknowledge event. " + GENERIC_MESSAGE, "EnSyncGenericError")
        }
    }

    async #rollBack (eventIdem, block) {
        try {
            const sentPayload = `ROLLBACK;CLIENT_ID=${this.config.clientId};EVENT_IDEM=${eventIdem};BLOCK=${block}`
            const {data} = await axios.post(this.config.url,sentPayload)
            if (data.startsWith("-FAIL:"))
                throw EnSyncError(data, "EnSyncGenericError")
                // return await reconnectClient(data, () => this.#rollBack(eventIdem, block))
            
            return data
        } catch (e) {
            throw new EnSyncError("Failed to trigger rollBack. " + GENERIC_MESSAGE, "EnSyncGenericError")
        }
    }

    async #reconnectClient (e, callback) {
        const errorMsg = data.replace("-FAIL:", "")
        if (errorMsg === "Client not found") {
            await this.createClient(this.config.accessKey)
            // reconnect to client and rerun
            await callback()
            return new Error(data)
        }
        return new Error(data)
    }

}

module.exports = {
  EnSyncEngine,
};