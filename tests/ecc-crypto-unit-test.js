// Comprehensive unit tests for ecc-crypto.js module
const assert = require('assert');
const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');
const crypto = require('../ecc-crypto.js');

describe('ECC Crypto Module Tests', function() {
  // Test data
  const testMessage = 'This is a secret message for testing';
  const largeTestMessage = JSON.stringify({
    content: 'This is a larger test message with nested data',
    timestamp: Date.now(),
    items: Array(100).fill().map((_, i) => ({ id: i, value: `Item ${i}` })),
    metadata: {
      source: 'unit-test',
      version: '1.0.0',
      tags: ['test', 'encryption', 'hybrid']
    }
  });
  
  // Generate test key pairs
  const generateKeyPair = () => {
    const keyPair = nacl.sign.keyPair();
    return {
      publicKey: keyPair.publicKey,
      publicKeyBase64: naclUtil.encodeBase64(keyPair.publicKey),
      secretKey: keyPair.secretKey,
      secretKeyBase64: naclUtil.encodeBase64(keyPair.secretKey)
    };
  };
  
  const keyPairs = Array(5).fill().map(() => generateKeyPair());
  
  describe('Traditional Ed25519 Encryption', function() {
    it('should encrypt and decrypt a message correctly', function() {
      const keyPair = keyPairs[0];
      
      // Encrypt with public key
      const encrypted = crypto.encryptEd25519(testMessage, keyPair.publicKey);
      
      // Verify encrypted structure
      assert.ok(encrypted.nonce, 'Encrypted result should have a nonce');
      assert.ok(encrypted.ciphertext, 'Encrypted result should have ciphertext');
      assert.ok(encrypted.ephemeralPublicKey, 'Encrypted result should have ephemeralPublicKey');
      
      // Decrypt with private key
      const decrypted = crypto.decryptEd25519(encrypted, keyPair.secretKey);
      
      // Verify decryption
      assert.strictEqual(decrypted, testMessage, 'Decrypted message should match original');
    });
    
    it('should work with base64 encoded keys', function() {
      const keyPair = keyPairs[1];
      
      // Encrypt with base64 public key
      const encrypted = crypto.encryptEd25519(testMessage, keyPair.publicKeyBase64);
      
      // Decrypt with base64 private key
      const decrypted = crypto.decryptEd25519(encrypted, keyPair.secretKeyBase64);
      
      // Verify decryption
      assert.strictEqual(decrypted, testMessage, 'Decrypted message should match original');
    });
    
    it('should handle large messages', function() {
      const keyPair = keyPairs[0];
      
      // Encrypt large message
      const encrypted = crypto.encryptEd25519(largeTestMessage, keyPair.publicKey);
      
      // Decrypt large message
      const decrypted = crypto.decryptEd25519(encrypted, keyPair.secretKey);
      
      // Verify decryption
      assert.strictEqual(decrypted, largeTestMessage, 'Decrypted large message should match original');
    });
    
    it('should fail with incorrect private key', function() {
      const keyPair1 = keyPairs[0];
      const keyPair2 = keyPairs[1];
      
      // Encrypt with keyPair1's public key
      const encrypted = crypto.encryptEd25519(testMessage, keyPair1.publicKey);
      
      // Try to decrypt with keyPair2's private key (should fail)
      assert.throws(() => {
        crypto.decryptEd25519(encrypted, keyPair2.secretKey);
      }, /Failed to decrypt/, 'Should throw an error when decrypting with wrong key');
    });
  });
  
  describe('Symmetric Message Key Encryption', function() {
    it('should generate a valid message key', function() {
      const messageKey = crypto.generateMessageKey();
      
      // Verify key properties
      assert.ok(messageKey instanceof Uint8Array, 'Message key should be a Uint8Array');
      assert.strictEqual(messageKey.length, nacl.secretbox.keyLength, 
        `Message key should be ${nacl.secretbox.keyLength} bytes long`);
    });
    
    it('should encrypt and decrypt with message key', function() {
      const messageKey = crypto.generateMessageKey();
      
      // Encrypt with message key
      const encrypted = crypto.encryptWithMessageKey(testMessage, messageKey);
      
      // Verify encrypted structure
      assert.ok(encrypted.nonce, 'Encrypted result should have a nonce');
      assert.ok(encrypted.ciphertext, 'Encrypted result should have ciphertext');
      
      // Decrypt with message key
      const decrypted = crypto.decryptWithMessageKey(encrypted, messageKey);
      
      // Verify decryption
      assert.strictEqual(decrypted, testMessage, 'Decrypted message should match original');
    });
    
    it('should handle large messages with symmetric encryption', function() {
      const messageKey = crypto.generateMessageKey();
      
      // Encrypt large message
      const encrypted = crypto.encryptWithMessageKey(largeTestMessage, messageKey);
      
      // Decrypt large message
      const decrypted = crypto.decryptWithMessageKey(encrypted, messageKey);
      
      // Verify decryption
      assert.strictEqual(decrypted, largeTestMessage, 'Decrypted large message should match original');
    });
    
    it('should fail with incorrect message key', function() {
      const messageKey1 = crypto.generateMessageKey();
      const messageKey2 = crypto.generateMessageKey();
      
      // Encrypt with messageKey1
      const encrypted = crypto.encryptWithMessageKey(testMessage, messageKey1);
      
      // Try to decrypt with messageKey2 (should fail)
      assert.throws(() => {
        crypto.decryptWithMessageKey(encrypted, messageKey2);
      }, /Failed to decrypt/, 'Should throw an error when decrypting with wrong key');
    });
  });
  
  describe('Message Key Distribution', function() {
    it('should encrypt and decrypt a message key', function() {
      const keyPair = keyPairs[0];
      const messageKey = crypto.generateMessageKey();
      
      // Encrypt message key with public key
      const encryptedKey = crypto.encryptMessageKey(messageKey, keyPair.publicKey);
      
      // Verify encrypted key structure
      assert.ok(encryptedKey.nonce, 'Encrypted key should have a nonce');
      assert.ok(encryptedKey.encryptedKey, 'Encrypted key should have encryptedKey');
      assert.ok(encryptedKey.ephemeralPublicKey, 'Encrypted key should have ephemeralPublicKey');
      
      // Decrypt message key with private key
      const decryptedKey = crypto.decryptMessageKey(encryptedKey, keyPair.secretKey);
      
      // Verify decryption
      assert.ok(decryptedKey instanceof Uint8Array, 'Decrypted key should be a Uint8Array');
      assert.strictEqual(decryptedKey.length, messageKey.length, 'Decrypted key should have same length');
      
      // Compare byte by byte
      for (let i = 0; i < messageKey.length; i++) {
        assert.strictEqual(decryptedKey[i], messageKey[i], `Byte at position ${i} should match`);
      }
    });
    
    it('should work with base64 encoded keys', function() {
      const keyPair = keyPairs[1];
      const messageKey = crypto.generateMessageKey();
      
      // Encrypt message key with base64 public key
      const encryptedKey = crypto.encryptMessageKey(messageKey, keyPair.publicKeyBase64);
      
      // Decrypt message key with base64 private key
      const decryptedKey = crypto.decryptMessageKey(encryptedKey, keyPair.secretKeyBase64);
      
      // Verify decryption (compare byte by byte)
      for (let i = 0; i < messageKey.length; i++) {
        assert.strictEqual(decryptedKey[i], messageKey[i], `Byte at position ${i} should match`);
      }
    });
  });
  
  describe('Hybrid Encryption', function() {
    it('should encrypt and decrypt for a single recipient', function() {
      const keyPair = keyPairs[0];
      
      // Encrypt with hybrid encryption
      const encrypted = crypto.hybridEncrypt(testMessage, [keyPair.publicKey]);
      
      // Verify encrypted structure
      assert.ok(encrypted.encryptedPayload, 'Hybrid encrypted result should have encryptedPayload');
      assert.ok(encrypted.encryptedKeys, 'Hybrid encrypted result should have encryptedKeys');
      
      // Get recipient ID
      const recipientId = naclUtil.encodeBase64(keyPair.publicKey);
      
      // Verify recipient key is present
      assert.ok(encrypted.encryptedKeys[recipientId], 'Encrypted keys should include recipient');
      
      // Decrypt with hybrid decryption
      const decrypted = crypto.hybridDecrypt(encrypted, keyPair.publicKey, keyPair.secretKey);
      
      // Verify decryption
      assert.strictEqual(decrypted, testMessage, 'Hybrid decrypted message should match original');
    });
    
    it('should encrypt and decrypt for multiple recipients', function() {
      // Use 3 recipients
      const recipients = keyPairs.slice(0, 3);
      const publicKeys = recipients.map(kp => kp.publicKey);
      
      // Encrypt with hybrid encryption for multiple recipients
      const encrypted = crypto.hybridEncrypt(testMessage, publicKeys);
      
      // Verify each recipient can decrypt
      for (const keyPair of recipients) {
        const decrypted = crypto.hybridDecrypt(encrypted, keyPair.publicKey, keyPair.secretKey);
        assert.strictEqual(decrypted, testMessage, 'Each recipient should be able to decrypt');
      }
    });
    
    it('should handle large messages with hybrid encryption', function() {
      // Use 3 recipients
      const recipients = keyPairs.slice(0, 3);
      const publicKeys = recipients.map(kp => kp.publicKey);
      
      // Encrypt large message with hybrid encryption
      const encrypted = crypto.hybridEncrypt(largeTestMessage, publicKeys);
      
      // Verify each recipient can decrypt the large message
      for (const keyPair of recipients) {
        const decrypted = crypto.hybridDecrypt(encrypted, keyPair.publicKey, keyPair.secretKey);
        assert.strictEqual(decrypted, largeTestMessage, 'Each recipient should be able to decrypt large message');
      }
    });
    
    it('should fail for non-recipients', function() {
      // Use first 3 recipients for encryption
      const encryptRecipients = keyPairs.slice(0, 3);
      const publicKeys = encryptRecipients.map(kp => kp.publicKey);
      
      // Encrypt with hybrid encryption
      const encrypted = crypto.hybridEncrypt(testMessage, publicKeys);
      
      // Try to decrypt with a non-recipient (keyPair[4])
      const nonRecipient = keyPairs[4];
      
      assert.throws(() => {
        crypto.hybridDecrypt(encrypted, nonRecipient.publicKey, nonRecipient.secretKey);
      }, /No encrypted key found/, 'Should throw an error when non-recipient tries to decrypt');
    });
    
    it('should be more efficient than traditional encryption for multiple recipients', function() {
      // Use 10 recipients for a meaningful comparison
      const recipients = Array(10).fill().map(() => generateKeyPair());
      const publicKeys = recipients.map(kp => kp.publicKey);
      
      // Measure traditional encryption time
      const traditionalStart = Date.now();
      const traditionalEncrypted = [];
      for (const publicKey of publicKeys) {
        const encrypted = crypto.encryptEd25519(largeTestMessage, publicKey);
        traditionalEncrypted.push(encrypted);
      }
      const traditionalTime = Date.now() - traditionalStart;
      
      // Measure hybrid encryption time
      const hybridStart = Date.now();
      const hybridEncrypted = crypto.hybridEncrypt(largeTestMessage, publicKeys);
      const hybridTime = Date.now() - hybridStart;
      
      console.log(`Traditional encryption for 10 recipients: ${traditionalTime}ms`);
      console.log(`Hybrid encryption for 10 recipients: ${hybridTime}ms`);
      console.log(`Improvement: ${((traditionalTime - hybridTime) / traditionalTime * 100).toFixed(2)}%`);
      
      // Hybrid should be faster (allowing some margin for test environment variability)
      assert.ok(hybridTime < traditionalTime * 0.9, 
        'Hybrid encryption should be at least 10% faster than traditional for multiple recipients');
      
      // Verify all recipients can still decrypt
      for (let i = 0; i < recipients.length; i++) {
        const keyPair = recipients[i];
        
        // Traditional decryption
        const traditionalDecrypted = crypto.decryptEd25519(traditionalEncrypted[i], keyPair.secretKey);
        assert.strictEqual(traditionalDecrypted, largeTestMessage, 'Traditional decryption should work');
        
        // Hybrid decryption
        const hybridDecrypted = crypto.hybridDecrypt(hybridEncrypted, keyPair.publicKey, keyPair.secretKey);
        assert.strictEqual(hybridDecrypted, largeTestMessage, 'Hybrid decryption should work');
      }
    });
  });
  
  describe('End-to-End Workflow', function() {
    it('should support a complete encryption workflow', function() {
      // Simulate a real-world scenario with multiple recipients
      const sender = generateKeyPair();
      const recipients = keyPairs.slice(0, 3);
      const recipientPublicKeys = recipients.map(kp => kp.publicKey);
      
      // Original message
      const originalMessage = JSON.stringify({
        content: 'Important confidential information',
        sender: 'test-sender',
        timestamp: Date.now()
      });
      
      // Step 1: Sender encrypts message for all recipients using hybrid encryption
      const encrypted = crypto.hybridEncrypt(originalMessage, recipientPublicKeys);
      
      // Step 2: Each recipient decrypts the message
      for (const recipient of recipients) {
        // Recipient decrypts the message
        const decrypted = crypto.hybridDecrypt(
          encrypted, 
          recipient.publicKey, 
          recipient.secretKey
        );
        
        // Verify decryption
        assert.strictEqual(decrypted, originalMessage, 'Recipient should be able to decrypt message');
        
        // Parse and verify content
        const parsedMessage = JSON.parse(decrypted);
        assert.strictEqual(parsedMessage.content, 'Important confidential information', 
          'Decrypted content should match original');
      }
    });
  });
});

// Run the tests if this file is executed directly
if (require.main === module) {
  console.log('Running ECC Crypto Unit Tests...');
  
  // Simple test runner
  let passed = 0;
  let failed = 0;
  
  const runTest = (name, fn) => {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err.message}`);
      failed++;
    }
  };
  
  // Run all tests
  const tests = [
    // Traditional Ed25519 Encryption
    ['Traditional: encrypt and decrypt', () => {
      const keyPair = nacl.sign.keyPair();
      const encrypted = crypto.encryptEd25519('test', keyPair.publicKey);
      const decrypted = crypto.decryptEd25519(encrypted, keyPair.secretKey);
      assert.strictEqual(decrypted, 'test');
    }],
    
    // Symmetric Message Key Encryption
    ['Symmetric: generate and use message key', () => {
      const messageKey = crypto.generateMessageKey();
      const encrypted = crypto.encryptWithMessageKey('test', messageKey);
      const decrypted = crypto.decryptWithMessageKey(encrypted, messageKey);
      assert.strictEqual(decrypted, 'test');
    }],
    
    // Message Key Distribution
    ['Key Distribution: encrypt and decrypt message key', () => {
      const keyPair = nacl.sign.keyPair();
      const messageKey = crypto.generateMessageKey();
      const encryptedKey = crypto.encryptMessageKey(messageKey, keyPair.publicKey);
      const decryptedKey = crypto.decryptMessageKey(encryptedKey, keyPair.secretKey);
      assert.strictEqual(decryptedKey.length, messageKey.length);
    }],
    
    // Hybrid Encryption
    ['Hybrid: encrypt and decrypt for single recipient', () => {
      const keyPair = nacl.sign.keyPair();
      const encrypted = crypto.hybridEncrypt('test', [keyPair.publicKey]);
      const decrypted = crypto.hybridDecrypt(encrypted, keyPair.publicKey, keyPair.secretKey);
      assert.strictEqual(decrypted, 'test');
    }],
    
    ['Hybrid: encrypt and decrypt for multiple recipients', () => {
      const keyPairs = [nacl.sign.keyPair(), nacl.sign.keyPair(), nacl.sign.keyPair()];
      const publicKeys = keyPairs.map(kp => kp.publicKey);
      const encrypted = crypto.hybridEncrypt('test', publicKeys);
      
      for (const keyPair of keyPairs) {
        const decrypted = crypto.hybridDecrypt(encrypted, keyPair.publicKey, keyPair.secretKey);
        assert.strictEqual(decrypted, 'test');
      }
    }]
  ];
  
  tests.forEach(([name, fn]) => runTest(name, fn));
  
  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
