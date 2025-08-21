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
    const subscription2 = await ensyncClient.subscribe("progo/bicycles/speed", { autoAck: false, appSecretKey: process.env.APP_SECRET_KEY });
    // subscription.on(async (event) => {
      
    // });
    subscription2.on(async (event) => {
      try {
        console.log("\nSpeed Event received:", event);
        
        // Manually acknowledge the event
        if (event.idem && event.block) {
          // try {
            console.log("ACK", await subscription2.ack(event.idem, event.block));
          //   console.log(`Event ${event.idem} successfully acknowledged\n`);
          // } catch (ackError) {
          //   console.error(`Failed to acknowledge event ${event.idem}:`, ackError);
          // }
        } else {
          console.warn("Cannot acknowledge event: missing idem or block");
        }
      } catch (e) {
        console.log("Exception:", e);
      }
    });
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nUnsubscribing and closing connection...');
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
