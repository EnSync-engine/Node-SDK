/// <reference types="node" />
import { EventEmitter } from "events";

/**
 * EnSync Error class for SDK errors
 */
export class EnSyncError extends Error {
  constructor(message: string, name: string);
  name: string;
}

/**
 * Message structure received from subscriptions
 */
export interface EnSyncMessage {
  /** Message name (created in EnSync UI) */
  messageName: string;
  /** Unique message ID */
  idem: string;
  /** Block ID for acknowledgment */
  block: string;
  /** Message timestamp in milliseconds */
  timestamp: number;
  /** Decrypted JSON payload */
  payload: Record<string, any>;
  /** Message metadata */
  metadata: {
    headers?: Record<string, any>;
    [key: string]: any;
  };
  /** Sender's public key (base64) */
  sender: string | null;
}

/**
 * JSON schema for payload validation
 */
export interface JsonSchema {
  [key: string]:
    | "string"
    | "integer"
    | "int"
    | "long"
    | "double"
    | "float"
    | "boolean"
    | "bool"
    | "object"
    | "array"
    | "null";
}

/**
 * Message metadata options
 */
export interface MessageMetadata {
  /** Whether to persist the message on the server */
  persist?: boolean;
  /** Custom headers */
  headers?: Record<string, any>;
}

/**
 * Publish options
 */
export interface PublishOptions {
  /** Whether to use hybrid encryption (default: true) */
  useHybridEncryption?: boolean;
  /** Optional JSON schema for payload validation */
  schema?: JsonSchema;
}

/**
 * Subscription options
 */
export interface SubscribeOptions {
  /** Automatically acknowledge messages (default: true) */
  autoAck?: boolean;
  /** Custom decryption key for this subscription */
  appSecretKey?: string;
}

/**
 * Client creation options
 */
export interface ClientOptions {
  /** Default key for message decryption */
  appSecretKey?: string;
}

/**
 * Engine configuration options
 */
export interface EngineOptions {
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatInterval?: number;
  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Enable console logging (default: false) */
  enableLogging?: boolean;
}

/**
 * Subscription object returned by subscribe()
 */
export interface Subscription {
  /** Add a message handler */
  on(handler: (message: EnSyncMessage) => void | Promise<void>): () => void;
  /** Acknowledge a message */
  ack(messageIdem: string, block: string): Promise<string>;
  /** Resume message delivery */
  resume(): Promise<object>;
  /** Pause message delivery */
  pause(reason?: string): Promise<object>;
  /** Defer message processing */
  defer(messageIdem: string, delayMs: number, reason?: string): Promise<object>;
  /** Discard a message permanently */
  discard(messageIdem: string, reason?: string): Promise<object>;
  /** Rollback a message */
  rollback(messageIdem: string, block: string): Promise<string>;
  /** Replay a specific message */
  replay(messageIdem: string): Promise<EnSyncMessage>;
  /** Unsubscribe from messages */
  unsubscribe(): Promise<void>;
}

/**
 * Message builder for fluent API
 */
export interface MessageBuilder {
  /** Set the recipients for the message */
  to(recipients: string | string[]): MessageBuilder;
  /** Set the message payload */
  withPayload(payload: Record<string, any>): MessageBuilder;
  /** Enable message persistence */
  persist(enabled?: boolean): MessageBuilder;
  /** Add custom headers to the message */
  withHeaders(headers: Record<string, any>): MessageBuilder;
  /** Add a JSON schema for payload validation */
  withSchema(schema: JsonSchema): MessageBuilder;
  /** Enable or disable hybrid encryption */
  useHybridEncryption(enabled?: boolean): MessageBuilder;
  /** Publish the message */
  publish(): Promise<string>;
}

/**
 * EnSync gRPC Engine - Main client class
 *
 * @example
 * ```typescript
 * const engine = new EnSyncEngine("grpcs://node.gms.ensync.cloud");
 * const client = await engine.createClient(appKey, { appSecretKey });
 *
 * // Builder pattern
 * await client.message("orders/created")
 *   .to(recipientKey)
 *   .withPayload({ orderId: "123" })
 *   .persist()
 *   .publish();
 *
 * // EventEmitter pattern
 * client.on("message:orders/created", (message) => {
 *   console.log(message.payload);
 * });
 * await client.subscribe("orders/created");
 * ```
 */
export class EnSyncEngine extends EventEmitter {
  /**
   * Creates a new EnSync gRPC client
   * @param url - gRPC server URL (e.g., "grpc://localhost:50051" or "grpcs://node.gms.ensync.cloud")
   * @param options - Configuration options
   */
  constructor(url: string, options?: EngineOptions);

  /**
   * Creates a new gRPC client and authenticates
   * @param appKey - The app key for authentication
   * @param options - Additional options
   * @returns A new EnSync gRPC client instance
   */
  createClient(appKey: string, options?: ClientOptions): Promise<EnSyncEngine>;

  /**
   * Creates a message builder for fluent API
   * @param messageName - Name of the message (created in EnSync UI)
   * @returns Message builder instance
   */
  message(messageName: string): MessageBuilder;

  /**
   * Publishes a message to the EnSync system (legacy method)
   * @param messageName - Name of the message
   * @param recipients - Array of base64 encoded public keys of recipients
   * @param payload - Message payload (must be valid JSON)
   * @param metadata - Message metadata
   * @param options - Additional options
   * @returns Server response with message ID(s)
   */
  publish(
    messageName: string,
    recipients: string[],
    payload: Record<string, any>,
    metadata?: MessageMetadata,
    options?: PublishOptions
  ): Promise<string>;

  /**
   * Subscribes to messages
   * @param messageName - Name of the message to subscribe to (e.g., "orders/created")
   * @param handler - Optional message handler function
   * @param options - Subscription options
   * @returns Subscription object with methods for message handling
   */
  subscribe(
    messageName: string,
    handler?: (message: EnSyncMessage) => void | Promise<void>,
    options?: SubscribeOptions
  ): Promise<Subscription>;

  /**
   * Subscribes to messages (options overload)
   * @param messageName - Name of the message to subscribe to
   * @param options - Subscription options
   * @returns Subscription object with methods for message handling
   */
  subscribe(messageName: string, options?: SubscribeOptions): Promise<Subscription>;

  /**
   * Closes the gRPC connection
   */
  close(): Promise<void>;

  /**
   * Gets the client's public key (client hash)
   * @returns The client's public key (base64 encoded)
   */
  getClientPublicKey(): string;

  /**
   * Gets the total byte size of a payload
   * @param payload - The payload object to measure
   * @returns The byte size of the payload
   */
  getPayloadByteSize(payload: Record<string, any>): number;

  /**
   * Gets the top-level skeleton of a payload with property datatypes
   * @param payload - The payload object to analyze
   * @returns An object with the same keys but values replaced with their datatypes
   */
  getPayloadSkeleton(payload: Record<string, any>): Record<string, string>;

  /**
   * Analyzes a payload and returns both byte size and skeleton
   * @param payload - The payload object to analyze
   * @returns An object containing byteSize and skeleton properties
   */
  analyzePayload(payload: Record<string, any>): {
    byteSize: number;
    skeleton: Record<string, string>;
  };

  // EventEmitter methods
  /**
   * Listen for messages on a specific message name
   * @param event - Event name in format "message:messageName" (e.g., "message:orders/created")
   * @param listener - Message handler function
   */
  on(event: `message:${string}`, listener: (message: EnSyncMessage) => void): this;

  /**
   * Listen for errors
   * @param event - "error"
   * @param listener - Error handler function
   */
  on(event: "error", listener: (error: Error) => void): this;

  on(event: string | symbol, listener: (...args: any[]) => void): this;

  /**
   * Listen for messages once
   * @param event - Event name in format "message:messageName"
   * @param listener - Message handler function
   */
  once(event: `message:${string}`, listener: (message: EnSyncMessage) => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  /**
   * Remove a listener
   * @param event - Event name
   * @param listener - Listener function to remove
   */
  off(event: string | symbol, listener: (...args: any[]) => void): this;
}

export default EnSyncEngine;
