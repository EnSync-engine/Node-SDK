# EnSync Client SDK

## Full Documentation

This is the client SDK for EnSync engine (event-delivery based integration engine) that enables you integrate with third-party apps as they though they were native to your system and in realtime.
<br/>
<br/>
See <https://docs.tryensync.com/start> for documentation on **EnSync Engine**.<br/>
See <https://docs.tryensync.com/sdk> for documentation on **Our SDKs**

## How to Install

``` @lang = js
npm install ensync-client-sdk
```

## How to Use

``` @lang=js
import {EnSyncEngine, EnSyncError} from "ensync-client-sdk"
```

### More Docs

To connect to an EnSync engine, use the command

``` @lang=js
new EnSyncEngine("<url_to_your_ensync>>", <props>)
```

Do note that you can connect using http or https. We recommend you use https as this would use http/2 under the hood to improve communication with the engine

#### List of supported props would be listed soon

To communicate with the engine, you would need to create a client (which generates a client Id) which would be used to initiate other actions on the engine's delivery system. To create a client use the below code

``` @lang=js
const client = await ensyncClient.createClient(<access_token>)
```

With you client now created, you can now start communication with the engine.

#### To Publish a message

``` @lang=js
await client.publish(<event_name>, <payload>)
```

#### To Subscribe to a message

``` @lang=js
const sub = await client.subscribe(<event_name>, {subscribeOnly: false})
```

#### To Unsubscribe

``` @lang=js
sub.unsubscribe()
```

#### To pull and acknowledge messages published to an event name use

``` @lang=js
sub.pull({autoAck: false}, async (event) => {
    // You can acknowledge after each pull here, but if you prefer the client sdk to auto acknowledge, set autoAck to true
    // Messing up with the block would lead to your message read not being acknowledged
    await client.ack(event.id, event.block)
})
```

#### To Close connection, use

``` @lang=js
client.close()
```

<br/>

### Code Sample for Event Producer

``` @lang=js
const {
    EnSyncEngine
} = require("ensync-client-sdk")

const response = async () => {
    try {
        const eventName = "yourcompany/payment/POS/PAYMENT_SUCCESSFUL" // Event Created using the ensync-cli see ()
        const ensyncClient = new EnSyncEngine("https://localhost:8443", {disableTls: true})
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

``` @lang=js
const {
  EnSyncEngine
} = require("ensync-client-sdk")

const response = async () => {
    try {
        const eventName = "yourcompany/payment/POS/PAYMENT_SUCCESSFUL"
        const ensyncClient = new EnSyncEngine("https://localhost:8443", {disableTls: true})
        const client = await ensyncClient.createClient("xxxxxxxxx")

        // You have to subscribe to the event before you pullRecords else the system would not identify your client as subscribed to receive this event
        const sub = await client.subscribe(eventName, {subscribeOnly: false})

        sub.pull({autoAck: false},
         async (event) => {
          try {
           console.log("event 1", event)
           // Acknowledge message read
           const ack = await sub.ack(event.id, event.block)
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
