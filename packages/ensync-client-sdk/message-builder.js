const { EnSyncError } = require("ensync-utils");

/**
 * Builder class for constructing and publishing messages
 */
class MessageBuilder {
  #client;
  #messageName;
  #recipients = [];
  #payload = {};
  #metadata = {};
  #options = {};

  /**
   * @param {Object} client - The EnSync client instance
   * @param {string} messageName - The message name
   */
  constructor(client, messageName) {
    this.#client = client;
    this.#messageName = messageName;
  }

  /**
   * Set the recipients for the message
   * @param {string|string[]} recipients - Recipient public key(s) in base64
   * @returns {MessageBuilder}
   */
  to(recipients) {
    if (Array.isArray(recipients)) {
      this.#recipients = recipients;
    } else {
      this.#recipients = [recipients];
    }
    return this;
  }

  /**
   * Set the message payload
   * @param {Object} payload - The message payload (must be valid JSON)
   * @returns {MessageBuilder}
   */
  withPayload(payload) {
    this.#payload = payload;
    return this;
  }

  /**
   * Enable message persistence
   * @param {boolean} [enabled=true] - Whether to persist the message
   * @returns {MessageBuilder}
   */
  persist(enabled = true) {
    this.#metadata.persist = enabled;
    return this;
  }

  /**
   * Add custom headers to the message
   * @param {Object} headers - Custom headers
   * @returns {MessageBuilder}
   */
  withHeaders(headers) {
    this.#metadata.headers = headers;
    return this;
  }

  /**
   * Add a JSON schema for payload validation
   * @param {Object} schema - JSON schema definition
   * @returns {MessageBuilder}
   */
  withSchema(schema) {
    this.#options.schema = schema;
    return this;
  }

  /**
   * Enable or disable hybrid encryption
   * @param {boolean} enabled - Whether to use hybrid encryption
   * @returns {MessageBuilder}
   */
  useHybridEncryption(enabled = true) {
    this.#options.useHybridEncryption = enabled;
    return this;
  }

  /**
   * Publish the message
   * @returns {Promise<string>} Message ID(s)
   */
  async publish() {
    if (!this.#messageName) {
      throw new EnSyncError("Message name is required", "EnSyncValidationError");
    }
    if (this.#recipients.length === 0) {
      throw new EnSyncError("At least one recipient is required", "EnSyncValidationError");
    }
    if (!this.#payload || Object.keys(this.#payload).length === 0) {
      throw new EnSyncError("Payload is required", "EnSyncValidationError");
    }

    return this.#client._publishInternal(
      this.#messageName,
      this.#recipients,
      this.#payload,
      this.#metadata,
      this.#options
    );
  }
}

module.exports = { MessageBuilder };
