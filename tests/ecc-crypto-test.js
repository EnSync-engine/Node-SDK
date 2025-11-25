// Test for Ed25519 public-key encryption/decryption using ecc-crypto.js
// Requires: tweetnacl, tweetnacl-util, ecc-crypto.js
const nacl = require("tweetnacl");
const naclUtil = require("tweetnacl-util");
const { encryptEd25519, decryptEd25519 } = require("../ecc-crypto");

console.log("Generating Ed25519 key pair...");
// const keyPair = nacl.sign.keyPair();

// console.log('\nPublic key (base64):', naclUtil.encodeBase64(keyPair.publicKey));
// console.log('Secret key (base64):', naclUtil.encodeBase64(keyPair.secretKey));

const publicKey = "RtZCnfMatX5M+gS6MJ++zfZc7efvAxP834MEcmkuXUs=";
const secretKey =
  "63uVKuv3OVIIbFDHpt5ZM2XCMufpTcCA6mUG7QnSSaBG1kKd8xq1fkz6BLown77N9lzt5+8DE/zfgwRyaS5dSw==";

const message = "Hello, this is a secret message using EdDSA encryption!";
console.log("\nOriginal message:", message);

console.log("\nEncrypting...");
const encrypted = encryptEd25519(message, naclUtil.decodeBase64(publicKey));
console.log("Encrypted package:", JSON.stringify(encrypted, null, 2));

console.log("\nDecrypting...");
const decrypted = decryptEd25519(encrypted, naclUtil.decodeBase64(secretKey));
console.log("Decrypted message:", decrypted);

console.log("\nDecryption successful?", decrypted === message);
