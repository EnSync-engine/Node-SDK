const {
 EnSyncEngine
} = require("../../index")


// Reading the accessKey from the CLI command
var args = process.argv.slice(2);
let accessKey;
let powerUsageEventName;
let powerUsageHighEventName;

args.forEach((arg, index) => {
 if (index === 0) accessKey = arg // MEGLQzJucfsVB09Z8KZTfNSsMzpQ4zGY
 else if (index === 1) powerUsageEventName = arg // utilityCompany/powerUsage
 else if (index === 2) powerUsageHighEventName = arg // utilityCompany/alerts/powerUsage/high
})

const powerSystem = async () => {
 const maximumPowerOutput = 1000 // In kWh 
 const minimumPowerOutput = 20 // In Celsius 
 const doNotExceed = 800

 // Event created
 const ensyncClient = new EnSyncEngine("localhost", "8443", {disableTls: true})
 const client = await ensyncClient.createClient(accessKey)
 // Generate random power usage
 while(true) {
  const currentOutput = (Math.random() * (maximumPowerOutput - minimumPowerOutput + 1) )
  console.log("currentOutput", currentOutput)
  if (currentOutput > doNotExceed) {

   // Invalid Data structure as this was not what was agreed with EnSync
   // try {
   //  const fail = await client.publish(powerUsageHighEventName, {"current":currentOutput, "dateTime": Date.now()})
   //  console.log("fail", fail)
   // } catch (_) { console.log("some")}

   // Usage is starting to get too high
   const tooHigh = await client.publish(powerUsageHighEventName, {"current.kWh":currentOutput, "dateTime": Date.now()})
   console.log("tooHigh", tooHigh)
   client.close()
   break;
  }
  // Normal power usage
  const normal = await client.publish(powerUsageEventName, {"current.kWh": currentOutput, "dateTime": Date.now()})
  console.log("normal", normal)
 }
}

(() => powerSystem())()