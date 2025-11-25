// require("dotenv").config();
import { EnSyncEngine } from 'ensync-client-sdk';

const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud", {enableLogging: true});

const client = await engine.createClient("J1ic4fbQzJq7YkgSsB3kZmkeMNbZsgcs", {
 appSecretKey: "MrwBVB06xWGl0TApa/EqDztcCj9VfYkBcDEiFyNwqUoxF1fuqEbdvbD7Y50iUY9CP08p3xk2FL4srVhVwHyI/g=="
});

console.log("client", client)

const subscription = await client.subscribe("gms/ensync/report/create", {
 autoAck: false
});

subscription.on(async (event) => {
 console.log("Received:", event.payload);
 await subscription.ack(event.idem, event.block);
});