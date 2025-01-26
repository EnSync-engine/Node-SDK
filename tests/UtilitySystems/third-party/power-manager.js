const {
 EnSyncEngine
} = require("../../../index")


// Reading the accessKey from the CLI command
var args = process.argv.slice(2);
let accessKey;
let powerUsageHighEventName;


args.forEach((arg, index) => {
 if (index === 0) accessKey = arg // GJAgRMXrlDnKqHJYSgJvFTYqQn0E9vWv
 else if (index === 1) powerUsageHighEventName = arg // utilityCompany/alerts/powerUsage/high
})

const powerManagement = async () => {
 const ensyncClient = new EnSyncEngine("localhost", "8443", {disableTls: true})
 const client = await ensyncClient.createClient(accessKey)
 const subscriberToHighPowerUsage = await client.subscribe(powerUsageHighEventName)

 subscriberToHighPowerUsage.pull({}, async (event) => {
  console.log("event", event)

  // Power consumption is high
  // System can trigger some not in use machine to shut-down by sending events to these machines
 })
}

(() => powerManagement())()