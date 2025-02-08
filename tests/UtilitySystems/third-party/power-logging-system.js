const { EnSyncEngine } = require("../../../index");

// Reading the accessKey from the CLI command
var args = process.argv.slice(2);
let accessKey;
let powerUsageEventName;

args.forEach((arg, index) => {
  if (index === 0)
    accessKey = arg; // GJAgRMXrlDnKqHJYSgJvFTYqQn0E9vWv
  else if (index === 1) powerUsageEventName = arg; // utilityCompany/powerUsage
});

const powerManagement = async () => {
  const ensyncClient = new EnSyncEngine("localhost", "8443", { disableTls: true });
  const client = await ensyncClient.createClient(accessKey);
  const subscriberToHighPowerUsage = await client.subscribe(powerUsageEventName);

  subscriberToHighPowerUsage.pull({}, async (event) => {
    console.log("event", event);

    // System tracks power usage and data can be sent to a data warehouse and used to create Power BI graph to identify power usage over time.
    // The graph can also be used to identify peek periods using a combination of the powerOutput as well as the datetime being sent through EnSync
  });
};

(() => powerManagement())();
