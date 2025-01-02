const {
  EnSyncEngine
} = require("ensync-client-sdk")

const response = async () => {
    try {
        const eventName = "adyen/payment/POS/PAYMENT_SUCCESSFUL"
        const ensyncClient = new EnSyncEngine("localhost", "8443", {disableTls: true})
        const client = await ensyncClient.createClient("Nedo7tix68Abk9SZb2XU5jDs71x4BTop")

        // You have to subscribe to the event before you pullRecords else the system would not identify your client as subscribed to receive this event
        const sub = await client.subscribe(eventName, {subscribeOnly: false})

        sub.pull({autoAck: false},
         async (event) => {
          try {
           console.log("event 1", event)
           // Acknowledge message read
           const ack = await client.ack(event.id, event.block)
           // Unsubscribe
          //  await sub.unsubscribe(eventName)
           console.log("acknowledged", event.id, ack, "\n")
          } catch (e) {
           console.log("Exception", e)
          }
        })

    } catch(e) {
        console.log("I got here")
        console.log("e", e.message)
    }
}
response()