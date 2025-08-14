const { EnSyncEngine } = require("../index");

const response = async () => {
  try {
    const eventName = process.env.EVENT_TO_PUBLISH;
    const ensyncClient = new EnSyncEngine("https://localhost:8443", { disableTls: true });
    const client = await ensyncClient.createClient(process.env.CLIENT_ACCESS_KEY);

    // You have to subscribe to the event before you pullRecords else the system would not identify your client as subscribed to receive this event
    const sub = await client.subscribe(eventName, process.env.APP_SECRET_KEY); // AppSecretKey

    sub.pull({ autoAck: false }, async (event) => {
      try {
        console.log("Payment received successfully", event);
        // Acknowledge message read
        const ack = await sub.ack(event.id, event.block);
        // // Unsubscribe
        // // await sub.unsubscribe();
        console.log("acknowledged", event.id, ack, "\n");
      } catch (e) {
        console.log("Exception", e);
      }
    });
  } catch (e) {
    console.log("I got here");
    console.log("e", e.message);
    client.destroy();
    ensyncClient.close();
  }
};
response();
