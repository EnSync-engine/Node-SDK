// require("dotenv").config();
import { EnSyncEngine } from 'ensync-client-sdk';

const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud", {enableLogging: true});

const client = await engine.createClient("2vq78o6gTEOex7maqwWlfESCiGydzQ4P", {
 appSecretKey: "ITQqzV7DexwDr8WvIm+8/HIOL6p9oDBWSJgJyp8qvzEYiVbdst8xUeIc+6+fnVjnXHXsv+SLQ5IWcsMFqhx0ng=="
});

console.log("client", client)

while(true){
  const randomNumber = Math.floor(Math.random() * 100);
  console.log("Generated random number:", randomNumber);

  if (randomNumber % 3 === 0) {
    const event = await client.publish("gms/ensync/report/create", ["MRdX7qhG3b2w+2OdIlGPQj9PKd8ZNhS+LK1YVcB8iP4="], {
      startFrom: new Date().toISOString(),
      endAt: randomNumber.toString(),
    });
    console.log("Event published:", event);
  }
}