/**
 * EnSync Utilities - Shared utilities for EnSync SDK packages
 * 
 * This package provides shared functionality for:
 * - Error handling
 * - Encryption/decryption (Ed25519, hybrid encryption)
 * - JSON validation and type checking
 */

const { EnSyncError, GENERIC_MESSAGE } = require("./error");
const {
  encryptEd25519,
  decryptEd25519,
  hybridEncrypt,
  hybridDecrypt,
  decryptMessageKey,
  decryptWithMessageKey,
  generateKeyPair,
} = require("./ecc-crypto");
const {
  getJsonType,
  validateType,
  validatePayloadSchema,
  getPayloadSchema,
  analyzePayload,
  isValidJson,
  safeJsonParse,
} = require("./json-utils");

module.exports = {
  // Error handling
  EnSyncError,
  GENERIC_MESSAGE,
  
  // Encryption
  encryptEd25519,
  decryptEd25519,
  hybridEncrypt,
  hybridDecrypt,
  decryptMessageKey,
  decryptWithMessageKey,
  generateKeyPair,
  
  // JSON utilities
  getJsonType,
  validateType,
  validatePayloadSchema,
  getPayloadSchema,
  analyzePayload,
  isValidJson,
  safeJsonParse,
};
