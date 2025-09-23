// EdDSA-compatible public key encryption using Ed25519 keys (converted to X25519 for ECDH), with symmetric encryption (XSalsa20-Poly1305)
// Requires 'tweetnacl' and 'tweetnacl-util'

const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');
const ed2curve = require('ed2curve');

/**
 * Converts an Ed25519 key (32-byte Uint8Array) to an X25519 key (for ECDH)
 * Uses ed2curve for the conversion.
 */
function ed25519PublicKeyToCurve25519(ed25519PublicKey) {
  return ed2curve.convertPublicKey(ed25519PublicKey);
}
function ed25519SecretKeyToCurve25519(ed25519SecretKey) {
  return ed2curve.convertSecretKey(ed25519SecretKey);
}

/**
 * Encrypts a message using the recipient's Ed25519 public key
 * @param {string} message - UTF-8 string to encrypt
 * @param {string|Uint8Array} recipientEd25519PublicKey - 32-byte Ed25519 public key (base64 string or Uint8Array)
 * @returns {object} { nonce, ciphertext, ephemeralPublicKey } (all base64)
 */
function encryptEd25519(message, recipientEd25519PublicKey) {
  // Convert base64 key to Uint8Array if needed
  const publicKeyBytes = typeof recipientEd25519PublicKey === 'string' 
    ? naclUtil.decodeBase64(recipientEd25519PublicKey)
    : recipientEd25519PublicKey;
  // Generate ephemeral key pair for sender
  const ephemeralKeyPair = nacl.box.keyPair();
  // Convert recipient Ed25519 public key to X25519
  const recipientCurve25519PublicKey = ed25519PublicKeyToCurve25519(publicKeyBytes);
  // Generate random nonce
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  // Encrypt
  const ciphertext = nacl.box(
    naclUtil.decodeUTF8(message),
    nonce,
    recipientCurve25519PublicKey,
    ephemeralKeyPair.secretKey
  );
  return {
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext),
    ephemeralPublicKey: naclUtil.encodeBase64(ephemeralKeyPair.publicKey)
  };
}

/**
 * Decrypts a message using the recipient's Ed25519 private key
 * @param {object} encrypted - { nonce, ciphertext, ephemeralPublicKey } (all base64)
 * @param {string|Uint8Array} recipientEd25519SecretKey - 64-byte Ed25519 secret key (base64 string or Uint8Array)
 * @returns {string} decrypted message (UTF-8)
 */
function decryptEd25519(encrypted, recipientEd25519SecretKey) {
  // Convert base64 key to Uint8Array if needed
  const secretKeyBytes = typeof recipientEd25519SecretKey === 'string'
    ? naclUtil.decodeBase64(recipientEd25519SecretKey)
    : recipientEd25519SecretKey;
  const nonce = naclUtil.decodeBase64(encrypted.nonce);
  const ciphertext = naclUtil.decodeBase64(encrypted.ciphertext);
  const ephemeralPublicKey = naclUtil.decodeBase64(encrypted.ephemeralPublicKey);
  // Convert recipient Ed25519 secret key to X25519
  const recipientCurve25519SecretKey = ed25519SecretKeyToCurve25519(secretKeyBytes);

  // Decrypt
  const plaintext = nacl.box.open(
    ciphertext,
    nonce,
    ephemeralPublicKey,
    recipientCurve25519SecretKey
  );
  if (!plaintext) throw new Error('Failed to decrypt: authentication failed');
  return naclUtil.encodeUTF8(plaintext);
}

/**
 * Generates a random symmetric key for message encryption
 * @returns {Uint8Array} 32-byte symmetric key
 */
function generateMessageKey() {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

/**
 * Encrypts a message using a symmetric key (XSalsa20-Poly1305)
 * @param {string} message - UTF-8 string to encrypt
 * @param {Uint8Array} messageKey - 32-byte symmetric key
 * @returns {object} { nonce, ciphertext } (all base64)
 */
function encryptWithMessageKey(message, messageKey) {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(
    naclUtil.decodeUTF8(message),
    nonce,
    messageKey
  );
  return {
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext)
  };
}

/**
 * Decrypts a message using a symmetric key
 * @param {object} encrypted - { nonce, ciphertext } (all base64)
 * @param {Uint8Array} messageKey - 32-byte symmetric key
 * @returns {string} decrypted message (UTF-8)
 */
function decryptWithMessageKey(encrypted, messageKey) {
  const nonce = naclUtil.decodeBase64(encrypted.nonce);
  const ciphertext = naclUtil.decodeBase64(encrypted.ciphertext);
  
  const plaintext = nacl.secretbox.open(
    ciphertext,
    nonce,
    messageKey
  );
  if (!plaintext) throw new Error('Failed to decrypt: authentication failed');
  return naclUtil.encodeUTF8(plaintext);
}

/**
 * Encrypts a message key for a specific recipient using their Ed25519 public key
 * @param {Uint8Array} messageKey - 32-byte symmetric key to encrypt
 * @param {string|Uint8Array} recipientEd25519PublicKey - 32-byte Ed25519 public key (base64 string or Uint8Array)
 * @returns {object} { nonce, encryptedKey, ephemeralPublicKey } (all base64)
 */
function encryptMessageKey(messageKey, recipientEd25519PublicKey) {
  // Convert base64 key to Uint8Array if needed
  const publicKeyBytes = typeof recipientEd25519PublicKey === 'string' 
    ? naclUtil.decodeBase64(recipientEd25519PublicKey)
    : recipientEd25519PublicKey;
  
  // Generate ephemeral key pair for sender
  const ephemeralKeyPair = nacl.box.keyPair();
  
  // Convert recipient Ed25519 public key to X25519
  const recipientCurve25519PublicKey = ed25519PublicKeyToCurve25519(publicKeyBytes);
  
  // Generate random nonce
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  // Encrypt the message key
  const encryptedKey = nacl.box(
    messageKey,
    nonce,
    recipientCurve25519PublicKey,
    ephemeralKeyPair.secretKey
  );
  
  return {
    nonce: naclUtil.encodeBase64(nonce),
    encryptedKey: naclUtil.encodeBase64(encryptedKey),
    ephemeralPublicKey: naclUtil.encodeBase64(ephemeralKeyPair.publicKey)
  };
}

/**
 * Decrypts a message key using the recipient's Ed25519 private key
 * @param {object} encryptedKey - { nonce, encryptedKey, ephemeralPublicKey } (all base64)
 * @param {string|Uint8Array} recipientEd25519SecretKey - 64-byte Ed25519 secret key (base64 string or Uint8Array)
 * @returns {Uint8Array} decrypted 32-byte message key
 */
function decryptMessageKey(encryptedKey, recipientEd25519SecretKey) {
  // Convert base64 key to Uint8Array if needed
  const secretKeyBytes = typeof recipientEd25519SecretKey === 'string'
    ? naclUtil.decodeBase64(recipientEd25519SecretKey)
    : recipientEd25519SecretKey;
  
  const nonce = naclUtil.decodeBase64(encryptedKey.nonce);
  const encryptedKeyBytes = naclUtil.decodeBase64(encryptedKey.encryptedKey);
  const ephemeralPublicKey = naclUtil.decodeBase64(encryptedKey.ephemeralPublicKey);
  
  // Convert recipient Ed25519 secret key to X25519
  const recipientCurve25519SecretKey = ed25519SecretKeyToCurve25519(secretKeyBytes);

  // Decrypt the message key
  const messageKey = nacl.box.open(
    encryptedKeyBytes,
    nonce,
    ephemeralPublicKey,
    recipientCurve25519SecretKey
  );
  
  if (!messageKey) throw new Error('Failed to decrypt message key: authentication failed');
  return messageKey;
}

/**
 * Encrypts a message using hybrid encryption (symmetric key for payload, asymmetric for key distribution)
 * @param {string} message - UTF-8 string to encrypt
 * @param {Array<string|Uint8Array>} recipientPublicKeys - Array of recipient Ed25519 public keys (base64 strings or Uint8Arrays)
 * @returns {object} { encryptedPayload, encryptedKeys } - Encrypted payload and keys for each recipient
 */
function hybridEncrypt(message, recipientPublicKeys) {
  // Generate a random message key for symmetric encryption
  const messageKey = generateMessageKey();
  
  // Encrypt the payload with the message key
  const encryptedPayload = encryptWithMessageKey(message, messageKey);
  
  // Encrypt the message key for each recipient
  const encryptedKeys = {};
  for (const publicKey of recipientPublicKeys) {
    const recipientId = typeof publicKey === 'string' ? publicKey : naclUtil.encodeBase64(publicKey);
    encryptedKeys[recipientId] = encryptMessageKey(messageKey, publicKey);
  }
  
  return {
    encryptedPayload,
    encryptedKeys
  };
}

/**
 * Decrypts a hybrid-encrypted message using the recipient's private key
 * @param {object} hybridEncrypted - { encryptedPayload, encryptedKeys } from hybridEncrypt
 * @param {string|Uint8Array} recipientPublicKey - Recipient's public key (to find their encrypted key)
 * @param {string|Uint8Array} recipientPrivateKey - Recipient's Ed25519 private key
 * @returns {string} Decrypted message
 */
function hybridDecrypt(hybridEncrypted, recipientPublicKey, recipientPrivateKey) {
  const { encryptedPayload, encryptedKeys } = hybridEncrypted;
  
  // Find the recipient's encrypted key
  const recipientId = typeof recipientPublicKey === 'string' 
    ? recipientPublicKey 
    : naclUtil.encodeBase64(recipientPublicKey);
  
  const encryptedKey = encryptedKeys[recipientId];
  if (!encryptedKey) {
    throw new Error('No encrypted key found for this recipient');
  }
  
  // Decrypt the message key
  const messageKey = decryptMessageKey(encryptedKey, recipientPrivateKey);
  
  // Decrypt the payload with the message key
  return decryptWithMessageKey(encryptedPayload, messageKey);
}

module.exports = {
  encryptEd25519,
  decryptEd25519,
  generateMessageKey,
  encryptWithMessageKey,
  decryptWithMessageKey,
  encryptMessageKey,
  decryptMessageKey,
  hybridEncrypt,
  hybridDecrypt
};
