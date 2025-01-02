const {
    EnSyncEngine
} = require("ensync-client-sdk")

const response = async () => {
    try {
        const eventName = "yourcompany/payment/POS/PAYMENT_SUCCESSFUL" // Event Created using the ensync-cli see ()
        const ensyncClient = new EnSyncEngine("localhost", "8443", {disableTls: true})
        const client = await ensyncClient.createClient("xxxxxxxxxxxxxxxxxx")
        console.log("client", client)
        const start = Date.now()
        let end

        // // Imitates microservice sending multiple events
        for (let index = 0; index < 60000; index++) {
            await client.publish(eventName, {name: "hi", responseType: index, transactionId: 1+index})
            console.log("index", index)
        }
        client.close()

    } catch(e) {
        console.log("Error", e?.message)
    }
}
response()