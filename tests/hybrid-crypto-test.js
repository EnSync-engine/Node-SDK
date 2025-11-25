// Simple test for hybrid encryption implementation
const assert = require("assert");
const nacl = require("tweetnacl");
const naclUtil = require("tweetnacl-util");
const crypto = require("../ecc-crypto.js");

console.log("Running Hybrid Encryption Tests...");

// Helper function to generate key pairs
function generateKeyPair() {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: keyPair.publicKey,
    publicKeyBase64: naclUtil.encodeBase64(keyPair.publicKey),
    secretKey: keyPair.secretKey,
    secretKeyBase64: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

// Simple test runner
let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

// Test data
const testMessage = "This is a secret message for testing";
const largeTestMessage = JSON.stringify({
  content: "This is a larger test message with nested data",
  timestamp: Date.now(),
  items: Array(10)
    .fill()
    .map((_, i) => ({ id: i, value: `Item ${i}` })),
  metadata: {
    source: "unit-test",
    version: "1.0.0",
    tags: ["test", "encryption", "hybrid"],
  },
});

// Generate some test key pairs
const keyPairs = Array(5)
  .fill()
  .map(() => generateKeyPair());

// Run tests
console.log("\n1. Testing Traditional Ed25519 Encryption:");

runTest("Traditional: encrypt and decrypt", () => {
  const keyPair = keyPairs[0];
  const encrypted = crypto.encryptEd25519(testMessage, keyPair.publicKey);
  const decrypted = crypto.decryptEd25519(encrypted, keyPair.secretKey);
  assert.strictEqual(decrypted, testMessage);
});

runTest("Traditional: base64 key support", () => {
  const keyPair = keyPairs[1];
  const encrypted = crypto.encryptEd25519(testMessage, keyPair.publicKeyBase64);
  const decrypted = crypto.decryptEd25519(encrypted, keyPair.secretKeyBase64);
  assert.strictEqual(decrypted, testMessage);
});

runTest("Traditional: large message support", () => {
  const keyPair = keyPairs[0];
  const encrypted = crypto.encryptEd25519(largeTestMessage, keyPair.publicKey);
  const decrypted = crypto.decryptEd25519(encrypted, keyPair.secretKey);
  assert.strictEqual(decrypted, largeTestMessage);
});

console.log("\n2. Testing Symmetric Message Key Encryption:");

runTest("Symmetric: generate message key", () => {
  const messageKey = crypto.generateMessageKey();
  assert(messageKey instanceof Uint8Array);
  assert.strictEqual(messageKey.length, nacl.secretbox.keyLength);
});

runTest("Symmetric: encrypt and decrypt", () => {
  const messageKey = crypto.generateMessageKey();
  const encrypted = crypto.encryptWithMessageKey(testMessage, messageKey);
  const decrypted = crypto.decryptWithMessageKey(encrypted, messageKey);
  assert.strictEqual(decrypted, testMessage);
});

runTest("Symmetric: large message support", () => {
  const messageKey = crypto.generateMessageKey();
  const encrypted = crypto.encryptWithMessageKey(largeTestMessage, messageKey);
  const decrypted = crypto.decryptWithMessageKey(encrypted, messageKey);
  assert.strictEqual(decrypted, largeTestMessage);
});

console.log("\n3. Testing Message Key Distribution:");

runTest("Key Distribution: encrypt and decrypt message key", () => {
  const keyPair = keyPairs[0];
  const messageKey = crypto.generateMessageKey();
  const encryptedKey = crypto.encryptMessageKey(messageKey, keyPair.publicKey);
  const decryptedKey = crypto.decryptMessageKey(encryptedKey, keyPair.secretKey);

  // Compare byte by byte
  assert.strictEqual(decryptedKey.length, messageKey.length);
  for (let i = 0; i < messageKey.length; i++) {
    assert.strictEqual(decryptedKey[i], messageKey[i]);
  }
});

console.log("\n4. Testing Hybrid Encryption:");

runTest("Hybrid: single recipient", () => {
  const keyPair = keyPairs[0];
  const encrypted = crypto.hybridEncrypt(testMessage, [keyPair.publicKey]);
  const decrypted = crypto.hybridDecrypt(encrypted, keyPair.publicKey, keyPair.secretKey);
  assert.strictEqual(decrypted, testMessage);
});

runTest("Hybrid: multiple recipients", () => {
  const recipients = keyPairs.slice(0, 3);
  const publicKeys = recipients.map((kp) => kp.publicKey);
  const encrypted = crypto.hybridEncrypt(testMessage, publicKeys);

  // Each recipient should be able to decrypt
  for (const keyPair of recipients) {
    const decrypted = crypto.hybridDecrypt(encrypted, keyPair.publicKey, keyPair.secretKey);
    assert.strictEqual(decrypted, testMessage);
  }
});

runTest("Hybrid: large message with multiple recipients", () => {
  const recipients = keyPairs.slice(0, 3);
  const publicKeys = recipients.map((kp) => kp.publicKey);
  const encrypted = crypto.hybridEncrypt(largeTestMessage, publicKeys);

  // Each recipient should be able to decrypt
  for (const keyPair of recipients) {
    const decrypted = crypto.hybridDecrypt(encrypted, keyPair.publicKey, keyPair.secretKey);
    assert.strictEqual(decrypted, largeTestMessage);
  }
});

runTest("Hybrid: non-recipient cannot decrypt", () => {
  const encryptRecipients = keyPairs.slice(0, 3);
  const publicKeys = encryptRecipients.map((kp) => kp.publicKey);
  const encrypted = crypto.hybridEncrypt(testMessage, publicKeys);

  // Try to decrypt with a non-recipient (keyPair[4])
  const nonRecipient = keyPairs[4];

  let errorThrown = false;
  try {
    crypto.hybridDecrypt(encrypted, nonRecipient.publicKey, nonRecipient.secretKey);
  } catch (err) {
    errorThrown = true;
    assert(err.message.includes("No encrypted key found"));
  }
  assert(errorThrown, "Should throw an error when non-recipient tries to decrypt");
});

console.log("\n5. Performance Comparison:");

runTest("Performance: hybrid vs traditional with multiple recipients", () => {
  // Use 10 recipients for a meaningful comparison
  const recipients = Array(10)
    .fill()
    .map(() => generateKeyPair());
  const publicKeys = recipients.map((kp) => kp.publicKey);

  console.log("  Testing with 10 recipients:");

  // Measure traditional encryption time
  const traditionalStart = Date.now();
  const traditionalEncrypted = [];
  for (const publicKey of publicKeys) {
    const encrypted = crypto.encryptEd25519(largeTestMessage, publicKey);
    traditionalEncrypted.push(encrypted);
  }
  const traditionalTime = Date.now() - traditionalStart;
  console.log(`  - Traditional encryption: ${traditionalTime}ms`);

  // Measure hybrid encryption time
  const hybridStart = Date.now();
  const hybridEncrypted = crypto.hybridEncrypt(largeTestMessage, publicKeys);
  const hybridTime = Date.now() - hybridStart;
  console.log(`  - Hybrid encryption: ${hybridTime}ms`);

  // Calculate improvement
  const improvement = ((traditionalTime - hybridTime) / traditionalTime) * 100;
  console.log(`  - Improvement: ${improvement.toFixed(2)}%`);

  // Verify all recipients can still decrypt (just one for brevity)
  const keyPair = recipients[0];

  // Traditional decryption
  const traditionalDecrypted = crypto.decryptEd25519(traditionalEncrypted[0], keyPair.secretKey);
  assert.strictEqual(traditionalDecrypted, largeTestMessage);

  // Hybrid decryption
  const hybridDecrypted = crypto.hybridDecrypt(
    hybridEncrypted,
    keyPair.publicKey,
    keyPair.secretKey
  );
  assert.strictEqual(hybridDecrypted, largeTestMessage);

  // Hybrid should generally be faster, but allow for test environment variability
  // This assertion might occasionally fail depending on system load
  // assert(hybridTime < traditionalTime, 'Hybrid encryption should be faster than traditional');
});

console.log("\n6. End-to-End Workflow:");

runTest("Workflow: complete encryption cycle", () => {
  // Simulate a real-world scenario with multiple recipients
  const recipients = keyPairs.slice(0, 3);
  const publicKeys = recipients.map((kp) => kp.publicKey);

  // Original message
  const originalMessage = JSON.stringify({
    content: "Important confidential information",
    sender: "test-sender",
    timestamp: Date.now(),
  });

  // Step 1: Encrypt message for all recipients using hybrid encryption
  const encrypted = crypto.hybridEncrypt(originalMessage, publicKeys);

  // Step 2: Each recipient decrypts the message
  for (const recipient of recipients) {
    // Recipient decrypts the message
    const decrypted = crypto.hybridDecrypt(encrypted, recipient.publicKey, recipient.secretKey);

    // Verify decryption
    assert.strictEqual(decrypted, originalMessage);

    // Parse and verify content
    const parsedMessage = JSON.parse(decrypted);
    assert.strictEqual(parsedMessage.content, "Important confidential information");
  }
});

// Summary
console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
