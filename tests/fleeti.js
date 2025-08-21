require('dotenv').config();
const { EnSyncWebSocketClient } = require('ensync-client-sdk');

const response = async () => {
    const wsEngine = new EnSyncWebSocketClient("ws://localhost:8082"); // EnSync URL
    const client = await wsEngine.createClient(process.env.ENSYNC_ACCESS_KEY); // EnSync App Key

    // Publish an event
    // Pass receiver as an array, event name, and event data
    await client.publish(process.env.EVENT_TO_PUBLISH, ["receiver"], {"lat":  Math.random(), "long": Math.random(),"date_time": Date.now()});
}

response();
