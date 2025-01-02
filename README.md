# EnSync Client SDK

## How to Install

```
npm install ensync-client-sdk
```

## Full Documentation

See <https://docs.tryensync.com/> for documentation on EnSync Engine
See <https://docs.tryensync.com/usage> for documentation on Our SDK

## How to Use

```
import {EnSyncEngine, EnSyncError} from "ensync-client-sdk"
```

### More Docs

To connect to an EnSync engine, use the command

```
new EnSyncEngine("ip_addr or localhost>, <ensync_engine_port>, <props>)
```

List of supported props would be listed soon

To communicate with the engine, you would need to create a client (which generates a client Id) which would be used to initiate other actions on the engine's delivery system. To create a client use the below code

```
const client = await ensyncClient.createClient(<access_token>)
```

With you client now created, you can now start communication with the engine.

To Publish a message:

```
await client.publish(<event_name>, <payload>)
```

To Subscribe to a message

```
const sub = await client.subscribe(<event_name>, {subscribeOnly: false})
```

To Unsubscribe

```
sub.unsubscribe()
```

To pull and acknowledge messages published to an event name use:

```
sub.pull({autoAck: false}, async (event) => {
    // You can acknowledge after each pull here, but if you prefer the client sdk to auto acknowledge, set autoAck to true
    // Messing up with the block would lead to your message read not being acknowledged
    await client.ack(event.id, event.block)
})
```

To Close connection, use:

```
client.close()
```

### Code Sample for Event Producer

```
const {
    EnSyncEngine
} = require("ensync-client-sdk")

const response = async () => {
    try {
        const eventName = "yourcompany/payment/POS/PAYMENT_SUCCESSFUL" // Event Created using the ensync-cli see ()
        const ensyncClient = new EnSyncEngine("localhost", "8443", {disableTls: true})
        const client = await ensyncClient.createClient("xxxxxxxxxxxxxxxxxx")

        // Imitates microservice sending multiple events
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
```

### Code Sample for Event Subscriber

```
const {
  EnSyncEngine
} = require("ensync-client-sdk")

const response = async () => {
    try {
        const eventName = "yourcompany/payment/POS/PAYMENT_SUCCESSFUL"
        const ensyncClient = new EnSyncEngine("localhost", "8443", {disableTls: true})
        const client = await ensyncClient.createClient("xxxxxxxxx")

        // You have to subscribe to the event before you pullRecords else the system would not identify your client as subscribed to receive this event
        const sub = await client.subscribe(eventName, {subscribeOnly: false})

        sub.pull({autoAck: false},
         async (event) => {
          try {
           console.log("event 1", event)
           // Acknowledge message read
           const ack = await client.ack(event.id, event.block)
           // Unsubscribe
           await sub.unsubscribe(eventName)
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
```
# Node-SDK
