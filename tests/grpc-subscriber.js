require("dotenv").config();
const { EnSyncEngine } = require("../packages/ensync-client-sdk/grpc");

console.log("Starting gRPC subscriber test...");

const response = async () => {
  try {
    const eventName = process.env.MESSAGE_TO_SUBSCRIBE || "progo/bicycles/coordinates";
    const ensyncClient = new EnSyncEngine("grpc://localhost:50051", {
      heartbeatInterval: 15000,
    });

    await ensyncClient.createClient(process.env.ENSYNC_ACCESS_KEY, {
      appSecretKey: process.env.APP_SECRET_KEY,
    });

    console.log("Successfully connected to gRPC server");
    console.log("Client ID:", ensyncClient.getClientPublicKey());

    // Subscribe to the event and set up the handler
    let totalEventsReceived = 0;
    let totalEventsAcknowledged = 0;
    let processedEvents = [];

    const subscription = await ensyncClient.subscribe(eventName, {
      autoAck: false,
      appSecretKey: process.env.APP_SECRET_KEY,
    });

    let eventCount = -1;

    // Example: Replay a specific event
    // const replayResult = await subscription.replay("1uTWWUuTNHB7");
    // console.log("Replay Result:", replayResult);

    subscription.on(async (event) => {
      try {
        eventCount++;
        console.log("\nEvent received:", event, "(Event #" + eventCount + ")");
        totalEventsReceived++;
        processedEvents.push(event.idem);

        // Example: Pause after first event
        if (eventCount === 1) {
          // const pauseResult = await subscription.pause("Pausing for testing");
          // console.log("Pause Result:", pauseResult);
          const unsub = await subscription.unsubscribe();
          console.log("Unsubscribed from event:", unsub);
        }

        // Example: Defer an event
        if (eventCount === 2) {
          // const deferResult = await subscription.defer(event.idem, 5000, "Deferring for 5 seconds");
          // console.log("Defer Result:", deferResult);
        }

        // Example: Discard an event
        if (eventCount === 3) {
          // const discardResult = await subscription.discard(event.idem, "Discarding test event");
          // console.log("Discard Result:", discardResult);
          // return; // Skip acknowledgment for discarded event
        }

        // Acknowledge the event
        await subscription.ack(event.idem, event.block);
        totalEventsAcknowledged++;
        console.log(`Event ${event.idem} acknowledged (Total: ${totalEventsAcknowledged})`);

        // Example: Resume after pausing
        if (eventCount === 5) {
          // const resumeResult = await subscription.resume();
          // console.log("Resume Result:", resumeResult);
        }
      } catch (error) {
        console.error("Error processing event:", error);
      }
    });

    console.log(`Subscribed to event: ${eventName}`);
    console.log("Waiting for events... (Press Ctrl+C to stop)");

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n\nShutting down gracefully...");
      console.log("\n=== Final Statistics ===");
      console.log(`Total events received: ${totalEventsReceived}`);
      console.log(`Total events acknowledged: ${totalEventsAcknowledged}`);
      console.log(`Processed event IDs: ${processedEvents.join(", ")}`);
      console.log("=====================\n");

      await subscription.unsubscribe();
      await ensyncClient.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("Fatal error occurred:", error);
    if (error.cause) {
      console.error("Caused by:", error.cause);
    }
    process.exit(1);
  }
};

response();
