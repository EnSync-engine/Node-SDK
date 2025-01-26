const {
    EnSyncEngine
} = require("ensync-client-sdk")

const response = async () => {
    try {
        // const eventName = "adyen/payment/POS/PAYMENT_SUCCESSFUL" // Event Created using the ensync-cli see ()
        const eventName = "mycompany/thirdparty/fintech/payapp" // Event Created using the ensync-cli see ()
        const ensyncClient = new EnSyncEngine("localhost", "8443", {disableTls: true})
        const client = await ensyncClient.createClient("ZfQWI7w4MpDj7WLJMg3pDHPwtNc7jsUz")
        console.log("client", client)

        // // Imitates microservice sending multiple events
        for (let index = 0; index < 5000; index++) {
            const start = Date.now()
            // await client.publish(eventName, {name: "hi", responseType: index, transactionId: 1+index})
            const c2 = await client.publish(eventName, {key: "hi"})
            end = Date.now()
            console.log("Duration", (end-start)/1, "/ms")
            // await client.publish(eventName, {key: "hi"})
            // console.log("index", index, c2)
        }
        // client.close()
        client.close()

    } catch(e) {
        console.log("Error", e?.message)
    }
}
response()