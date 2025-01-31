const {
  EnSyncEngine
} = require("../index")

const response = async () => {
    try {
        const eventName = "mycompany/thirdparty/fintech/payapp"
        const ensyncClient = new EnSyncEngine( "https://localhost:8443", {disableTls: true})
        const client = await ensyncClient.createClient("PrChWGTPMZ0lQCruPVmAOw7V8JYxomjd")

        // You have to subscribe to the event before you pullRecords else the system would not identify your client as subscribed to receive this event
        const sub = await client.subscribe(eventName)

        sub.pull({autoAck: false},
         async (event) => {
          try {
           console.log("Payment received successfully", event)
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
