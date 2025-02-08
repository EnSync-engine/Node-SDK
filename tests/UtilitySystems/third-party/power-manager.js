const { EnSyncEngine } = require("../../../index");

// Reading the accessKey from the CLI command
var args = process.argv.slice(2);
let accessKey;
let powerUsageHighEventName;

args.forEach((arg, index) => {
  if (index === 0)
    accessKey = arg; // GJAgRMXrlDnKqHJYSgJvFTYqQn0E9vWv
  else if (index === 1) powerUsageHighEventName = arg; // utilityCompany/alerts/powerUsage/high
});

const powerManagement = async () => {
  // "http://localhost:8082"
  const ensyncClient = new EnSyncEngine("http://localhost:8082", { disableTls: true });
  const client = await ensyncClient.createClient(accessKey);

  const subscriberToHighPowerUsage = await client.subscribe(powerUsageHighEventName);
  await subscriberToHighPowerUsage.rollback("qbGKPKrb5wua", "2328000");
  subscriberToHighPowerUsage.pull({ autoAck: false }, async (event) => {
    await subscriberToHighPowerUsage.ack(event.id, event.block);
    await subscriberToHighPowerUsage.rollback("qbGKPKrb5wua", "2328000");
    // Power consumption is high
    // System can trigger some not in use machine to shut-down by sending events to these machines
    // System can also trigger another service to increase cooling
    // System could also send notification/emails to site manager or administration
    // Show replay-ability
  });
};

(() => powerManagement())();
