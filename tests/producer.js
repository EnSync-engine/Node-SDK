const {
    EnSyncEngine
} = require("../index")

const response = async () => {
    try {
        // const eventName = "adyen/payment/POS/PAYMENT_SUCCESSFUL" // Event Created using the ensync-cli see ()
        const eventName = "mycompany/thirdparty/fintech/payapp" // Event Created using the ensync-cli see ()
        const ensyncClient = new EnSyncEngine("https://localhost:8443", {disableTls: true})
        // Pass your accessKey created through out CLI here
        const client = await ensyncClient.createClient("ZfQWI7w4MpDj7WLJMg3pDHPwtNc7jsUz")
        console.log("client", client)

        // // Imitates microservice sending multiple events
        for (let index = 0; index < 1; index++) {
            const start = Date.now()
            await client.publish(eventName, {name: "hi", responseType: index, transactionId: 1+index})
            // const c2 = await client.publish(eventName, {key: "hi", me: {}})
        //     end = Date.now()
        //     console.log("Duration", (end-start)/1, "/ms")
        //     // await client.publish(eventName, {key: "hi"})
            console.log("index", index, c2)
        }
        // client.close()
        ensyncClient.close()

    } catch(e) {
        console.log("Error", e?.message)
    }
}
response()