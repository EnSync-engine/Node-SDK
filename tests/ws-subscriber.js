require('dotenv').config();
const { EnSyncWebSocketClient } = require("../websocket");

const response = async () => {
  try {
    const eventName = process.env.EVENT_TO_SUBSCRIBE || "ensync/stripe/external/success";
    const ensyncClient = new EnSyncWebSocketClient("ws://localhost:8082", { disableTls: true });
    await ensyncClient.createClient(process.env.CLIENT_ACCESS_KEY, { appSecretKey: process.env.APP_SECRET_KEY });

    // Subscribe to the event and set up the handler
    const subscription = await ensyncClient.subscribe(eventName);
    subscription.on(async (event) => {
      try {
        console.log("\nEvent received:", event);
        console.log("Acknowledged\n");
      } catch (e) {
        console.log("Exception:", e);
      }
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nUnsubscribing and closing connection...');
      await subscription.unsubscribe();
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
