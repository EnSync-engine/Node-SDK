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

module.exports = {
  encryptEd25519,
  decryptEd25519
};

// Usage example (uncomment to test):
// const kp = nacl.sign.keyPair();
// const encrypted = encryptEd25519('hello', kp.publicKey);
// const decrypted = decryptEd25519(encrypted, kp.secretKey);
// console.log(decrypted);
