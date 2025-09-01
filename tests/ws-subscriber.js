require('dotenv').config();
const { EnSyncEngine } = require("../websocket");

const response = async () => {
  try {
    const eventName = process.env.EVENT_TO_SUBSCRIBE || "progo/bicycles/coordinates";
    const ensyncClient = new EnSyncEngine("ws://localhost:8082", { disableTls: true });
    await ensyncClient.createClient(process.env.CLIENT_ACCESS_KEY, { appSecretKey: process.env.APP_SECRET_KEY });

    // Subscribe to the event and set up the handler
    // Setting autoAck to false to manually acknowledge events
    // const subscription = await ensyncClient.subscribe(eventName, { autoAck: false, appSecretKey: process.env.APP_SECRET_KEY });
    let totalEventsReceived = 0;
    let totalEventsAcknowledged = 0;
    let processedEvents = [];
    const subscription2 = await ensyncClient.subscribe(eventName, { autoAck: false, appSecretKey: process.env.APP_SECRET_KEY });
    // subscription.on(async (event) => {
      
    // });
    subscription2.on(async (event) => {
      try {
        console.log("\nSpeed Event received:", event);
        totalEventsReceived++;
        processedEvents.push(event.idem);
        // Manually acknowledge the event
        console.log("ACK", await subscription2.ack(event.idem, event.block));
        totalEventsAcknowledged++;
      } catch (e) {
        console.log("Exception:", e);
      }
    });
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nUnsubscribing and closing connection...');
      console.log("Total Events Received:", totalEventsReceived);
      console.log("Total Events Acknowledged:", totalEventsAcknowledged);
      console.log("Processed Events:", processedEvents);
      // await subscription.unsubscribe();
      await ensyncClient.close();
      process.exit(0);
    });

  } catch (e) {
    console.log("Error occurred");
    console.log("Error:", e.message);
    process.exit(1);
  }
};

response();
