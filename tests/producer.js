require("dotenv").config();
const { EnSyncEngine } = require("../index");

const response = async () => {
  const ensyncClient = new EnSyncEngine("https://localhost:8443", { disableTls: true });
  const client = await ensyncClient.createClient(process.env.ENSYNC_ACCESS_KEY); // accessKey
  try {
    // const eventName = "adyen/payment/POS/PAYMENT_SUCCESSFUL" // Event Created using the ensync-cli see ()
    const eventName = process.env.EVENT_TO_PUBLISH; // Event Created using the ensync-cli see ()
    // Pass your accessKey created through out CLI here
    console.log("client", client, new Date().toISOString());

    // Track total execution time
    const totalStartTime = Date.now();

    // Wait for server to initialize
    console.log("Waiting for server initialization...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Array to store all durations
    const durations = [];

    // // Imitates microservice sending multiple events
    for (let index = 0; index < 2000; index++) {
      const start = Date.now();
      const c2 = await client.publish(eventName, [process.env.RECEIVER_IDENTIFICATION_NUMBER], {
        // receiverIdentificationNumber
        name: "hey",
        responseType: 12,
        data: {
          props: "1",
        },
      });
      // const c2 = await client.publish(eventName, {key: "hi", me: {}})
      const end = Date.now();
      const duration = end - start;
      durations.push(duration);
      console.log("c2", c2);
      console.log("Duration", duration, "ms", "index", index);

      // Calculate and show statistics every 100 requests
      if (index > 0 && index % 100 === 0) {
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        // console.log(`\nStatistics after ${index} requests:`);
        // console.log(`Average duration: ${avg.toFixed(2)} ms`);
        // console.log(`Minimum duration: ${min} ms`);
        // console.log(`Maximum duration: ${max} ms\n`);
        // console.log("Date", new Date().toLocaleString());
      }
    }

    // Calculate final statistics
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    console.log("\n=== Final Statistics ===");
    console.log(`Total requests: ${durations.length}`);
    console.log(`Average duration: ${avg.toFixed(2)} ms`);
    console.log(`Minimum duration: ${min} ms`);
    console.log(`Maximum duration: ${max} ms`);
    console.log("Date of Execution", new Date().toLocaleString());
    console.log("=====================");

    // Calculate total execution time
    const totalTime = Date.now() - totalStartTime;
    console.log(`\nTotal execution time: ${(totalTime / 1000).toFixed(2)} seconds\n`);
    const event = await client.publish(eventName, [process.env.RECEIVER_IDENTIFICATION_NUMBER], {
      // receiverIdentificationNumber
      name: "hey",
      responseType: 12,
      data: {
        props: "1",
      },
    });

    console.log("event", event);
    client.destroy(true);
    ensyncClient.close();
  } catch (e) {
    console.log("Error", e?.message);
    client.destroy();
    ensyncClient.close();
  }
};
response();
