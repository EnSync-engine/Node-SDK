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

    let eventCount = -1;
    subscription2.on(async (event) => {
      try {
        eventCount++;
        console.log("\nSpeed Event received:", event, "(Event #" + eventCount + ")");
        totalEventsReceived++;
        processedEvents.push(event.idem);

        const pauseResult = await subscription2.pause("Pausing event");
        console.log("Pause Result:", pauseResult);
        // Defer 2nd event
        // if (eventCount === 1) {
        //   console.log("\nDeferring 2nd event...");
        //   const deferResult = await subscription2.defer(event.idem, 0, "Deferring second event");
        //   console.log("Defer Result:", deferResult);

          // Resume processing after 2 seconds
          // setTimeout(async () => {
          //   console.log("\nResuming event processing...");
          //   const continueResult = await subscription2.continue();
          //   console.log("Continue Result:", continueResult);
          // }, 2000);
        //   return;
        // }

        // Discard 5th event
        // if (eventCount === 4) {
        //   console.log("\nDiscarding 5th event...");
        //   const discardResult = await subscription2.discard(event.idem, "Discarding fifth event");
        //   console.log("Discard Result:", discardResult);
        //   return;
        // }

        // Acknowledge other events
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
