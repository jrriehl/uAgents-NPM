export * from 'util';
import { ec } from 'elliptic';
import { ZodSchema, z } from 'zod';
import { SigningStargateClient } from '@cosmjs/stargate';
import { CosmWasmClient, SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';

declare const Agent = "tmp";

declare const ASGI = "tmp";

type EncodableValue = string | number | Buffer;
declare function generateUserAddress(): string;
declare function isUserAddress(address: string): boolean;
declare function deriveKeyFromSeed(seed: string, prefix: string, index: number): Buffer;
declare function encodeLengthPrefixed(value: EncodableValue): Buffer;
/**
 * An identity is a cryptographic keypair that can be used to sign messages.
 */
declare class Identity {
    private readonly keyPair;
    private readonly address;
    private readonly pubKey;
    /**
     * Create a new identity from a signing key.
     */
    constructor(keyPair: ec.KeyPair);
    /**
     * Create a new identity from a seed and index.
     */
    static fromSeed(seed: string, index: number): Identity;
    /**
     * Generate a random new identity.
     */
    static generate(): Identity;
    /**
     * Create a new identity from a private key.
     */
    static fromString(privateKeyHex: string): Identity;
    /**
     * Property to access the private key of the identity.
     */
    get privateKey(): string;
    /**
     * Property to access the address of the identity.
     */
    get getAddress(): string;
    get getPubKey(): string;
    /**
     * Sign the provided data.
     */
    sign(data: Buffer): string;
    signB64(data: Buffer): string;
    /**
     * Sign the provided digest.
     */
    signDigest(digest: Buffer): string;
    /**
     * Sign the registration data for the Almanac contract.
     */
    signRegistration(contractAddress: string, sequence: number, walletAddress: string): string;
    signArbitrary(data: Buffer): [string, string];
    /**
     * Verify that the signature is correct for the provided signer address and digest.
     */
    static verifyDigest(address: string, digest: Buffer, signature: string): void;
    private getCanonicalSignature;
}

/**
 * Represents an envelope for message communication between agents.
 *
 * Attributes:
 *     version (number): The envelope version.
 *     sender (string): The sender's address.
 *     target (string): The target's address.
 *     session (string): The session UUID that persists for back-and-forth dialogues between agents.
 *     schemaDigest (string): The schema digest for the enclosed message.
 *     protocolDigest (string?): The digest of the protocol associated with the message (optional).
 *     payload (string?): The encoded message payload of the envelope (optional).
 *     expires (number?): The expiration timestamp (optional).
 *     nonce (number?): The nonce value (optional).
 *     signature (string?): The envelope signature (optional).
 */
declare class Envelope {
    version: number;
    sender: string;
    target: string;
    session: string;
    schemaDigest: string;
    protocolDigest?: string;
    payload?: string;
    expires?: number;
    nonce?: number;
    signature?: string;
    constructor({ version, sender, target, session, schemaDigest, protocolDigest, payload, expires, nonce, signature, }: {
        version: number;
        sender: string;
        target: string;
        session: string;
        schemaDigest: string;
        protocolDigest?: string;
        payload?: string;
        expires?: number;
        nonce?: number;
        signature?: string;
    });
    /**
     * Encode the payload value and store it in the envelope.
     *
     * @param value The payload value to be encoded.
     */
    encodePayload(value: string): void;
    /**
     * Decode and retrieve the payload value from the envelope.
     *
     * @returns The decoded payload value, or '' if payload is not present.
     */
    decodePayload(): string;
    /**
     * Sign the envelope using the provided signing function.
     *
     * @param identity The identity used for signing.
     * @throws Error if signing fails
     */
    sign(identity: Identity): void;
    /**
     * Verify the envelope's signature.
     *
     * @returns True if the signature is valid.
     * @throws Error if the signature is missing.
     */
    verify(): void;
    /**
     * Convert the envelope to JSON for sending
     */
    toJSON(): string;
    /**
     * Compute the digest of the envelope's content.
     *
     * @returns The computed digest.
     */
    private _digest;
    /**
     * Validate the envelope data against the Envelope schema.
     *
     * @param data The data to be validated.
     * @returns A new Envelope instance if the data is valid.
     */
    static modelValidate(data: unknown): Envelope;
}
/**
 * Represents a historical entry of an envelope.
 */
declare class EnvelopeHistoryEntry {
    timestamp: number;
    version: number;
    sender: string;
    target: string;
    session: string;
    schemaDigest: string;
    protocolDigest?: string;
    payload?: string;
    constructor({ timestamp, version, sender, target, session, schemaDigest, protocolDigest, payload, }: {
        timestamp?: number;
        version: number;
        sender: string;
        target: string;
        session: string;
        schemaDigest: string;
        protocolDigest?: string;
        payload?: string;
    });
    /**
     * Creates an EnvelopeHistoryEntry from an Envelope instance
     */
    static fromEnvelope(envelope: Envelope): EnvelopeHistoryEntry;
}
/**
 * Manages a history of envelope entries with retention policy.
 */
declare class EnvelopeHistory {
    envelopes: EnvelopeHistoryEntry[];
    constructor();
    /**
     * Add a new entry to the history and apply retention policy
     */
    addEntry(entry: EnvelopeHistoryEntry): void;
    /**
     * Remove entries older than 24 hours
     */
    applyRetentionPolicy(): void;
}

/**
 * A wrapper around a zod schemas that provides additional functionality for uAgents.
 * The model class is used to validate incoming messages to ensure they match the expected schema,
 * and generate model digests compatible with the python uAgent SDK.
 */
declare class Model<T extends Record<string, any>> {
    private schema;
    /**
     * Constructor for a uAgent model.
     * @param schema a zod schema defining attributes, types, constraints, etc.
     * The schema must include at least one title for the top-level object, using zod-openapi.
     * zod-openapi titles, types, etc. can be used to add additional metadata to the schema.
     * @example
     * ```typescript
     * const schema = z
        .object({
          check: z.boolean(),
          message: z.string(),
          counter: z.number().int().openapi({ description: "counts how many times the check has been run" }),
        })
        .openapi({
          description: "Plus random docstring",
          title: "SuperImportantCheck",
        });
     * ```
     * @see https://zod.dev/ for more information on zod
     * @see https://github.com/samchungy/zod-openapi for more information on zod-openapi
     */
    constructor(schema: ZodSchema<T>);
    validate(obj: unknown): T;
    dumpJson(data: T): string;
    dump(data: T): T;
    static buildSchemaDigest(schemaOrModel: ZodSchema | Model<any>): string;
}

/**
 * Parse an agent identifier string into prefix, name, and address.
 *
 * @param {string} identifier - The identifier string to be parsed.
 * @returns {[string, string, string]} A tuple containing the prefix, name, and address as strings.
 */
declare function parseIdentifier(identifier: string): [string, string, string];
declare abstract class Resolver {
    abstract resolve(destination: string): Promise<[string | null, string[]]>;
}
declare class AlmanacContractResolver extends Resolver {
    private _maxEndpoints;
    constructor(maxEndpoints?: number);
    resolve(destination: string): Promise<[string | null, string[]]>;
}
declare class AlmanacApiResolver extends Resolver {
    private _maxEndpoints;
    private _almanacApiUrl;
    private _almanacContractResolver;
    constructor(maxEndpoints?: number, almanacApiUrl?: string);
    private _apiResolve;
    resolve(destination: string): Promise<[string | null, string[]]>;
}
declare class NameServiceResolver extends Resolver {
    private _maxEndpoints;
    private _almanacApiResolver;
    constructor(maxEndpoints?: number);
    resolve(destination: string): Promise<[string | null, string[]]>;
}
declare class GlobalResolver extends Resolver {
    private _maxEndpoints;
    private _almanacApiResolver;
    private _nameServiceResolver;
    constructor(maxEndpoints?: number, almanacApiUrl?: string);
    resolve(destination: string): Promise<[string | null, string[]]>;
}
declare class RulesBasedResolver extends Resolver {
    private _rules;
    private _maxEndpoints;
    constructor(rules: Record<string, string[]>, maxEndpoints?: number);
    resolve(destination: string): Promise<[string | null, string[]]>;
}

declare enum LogLevel {
    "DEBUG" = "DEBUG",
    "INFO" = "INFO",
    "WARN" = "WARN",
    "ERROR" = "ERROR"
}
type Logger = {
    logLevel: LogLevel;
    name: string;
};

/**
 * Interface for a key-value like storage system.
 */
interface StorageAPI {
    get(key: string): any | null;
    has(key: string): boolean;
    set(key: string, value: any): void;
    remove(key: string): void;
    clear(): void;
}
/**
 * A simple key-value store implementation for data storage.
 *
 * Attributes:
 *   _data ({ [key: string]: any }): The internal data storage dictionary.
 *   _name (string): The name associated with the store.
 *   _path (string): The file path where the store data is stored.
 *
 * Methods:
 *   constructor: Initialize the KeyValueStore instance.
 *   get: Get the value associated with a key from the store.
 *   has: Check if a key exists in the store.
 *   set: Set a value associated with a key in the store.
 *   remove: Remove a key and its associated value from the store.
 *   clear: Clear all data from the store.
 *   _load: Load data from the file into the store.
 *   _save: Save the store data to the file.
 */
declare class KeyValueStore implements StorageAPI {
    private _data;
    private _name;
    private _path;
    /**
     * Initialize the KeyValueStore instance.
     *
     * @param name - The name associated with the store.
     * @param cwd - The current working directory. Defaults to null.
     */
    constructor(name: string, cwd?: string | null);
    /**
     * Get the value associated with a key in the store.
     *
     * @param key - The key whose value to get.
     * @returns The value associated with the key, or null if not found.
     */
    get(key: string): any | null;
    /**
     * Check if the store has a specific key.
     *
     * @param key - The key to check existence for.
     * @returns True if the key exists, false otherwise.
     */
    has(key: string): boolean;
    /**
     * Set a value associated with a key in the store.
     *
     * @param key - The key whose value to set.
     * @param value - The value to associate with the key.
     */
    set(key: string, value: any): void;
    /**
     * Remove a key and its associated value from the store.
     *
     * @param key - The key to remove.
     */
    remove(key: string): void;
    /**
     * Clear all data from the store.
     */
    clear(): void;
    /**
     * Load data from the file into the store.
     */
    private _load;
    /**
     * Save the store data to the file.
     */
    private _save;
}

declare class Protocol {
    /**
     * The Protocol class encapsulates a particular set of functionalities for an agent.
     * It typically relates to the exchange of messages between agents for executing some task.
     * It includes the message (model) types it supports, the allowed replies, and the
     * interval message handlers that define the logic of the protocol.
     */
    private _intervalHandlers;
    private _intervalMessages;
    private _signedMessageHandlers;
    private _unsignedMessageHandlers;
    private _models;
    private _replies;
    private _name;
    private _version;
    private _canonicalName;
    private _digest;
    private spec;
    constructor(name?: string, version?: string);
    get intervals(): [IntervalCallback, number][];
    get models(): Record<string, Model<any>>;
    get replies(): Record<string, Record<string, Model<any>>>;
    get intervalMessages(): Set<string>;
    get signedMessageHandlers(): Record<string, MessageCallback>;
    get unsignedMessageHandlers(): Record<string, MessageCallback>;
    get name(): string;
    get version(): string;
    get canonicalName(): string;
    get digest(): any;
    onInterval(period: number, messages?: Model<any> | Set<Model<any>>): (func: IntervalCallback) => IntervalCallback;
    private _addIntervalHandler;
    onQuery(model: Model<any>, replies?: Model<any> | Set<Model<any>>): (func: MessageCallback) => MessageCallback;
    onMessage(model: Model<any>, replies?: Model<any> | Set<Model<any>>, allowUnverified?: boolean): (func: MessageCallback) => MessageCallback;
    private _addMessageHandler;
    manifest(): Record<string, any>;
    static computeDigest(manifest: Record<string, any>): string;
}

interface Dispenser {
    addEnvelope: (envelope: Envelope, endpoints: string[], responseFuture: Promise<any>, sync?: boolean) => void;
}
declare const ErrorMessage: z.ZodObject<{
    error: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    error: string;
    details?: string | undefined;
}, {
    error: string;
    details?: string | undefined;
}>;
type ErrorMessageType = z.infer<typeof ErrorMessage>;
interface AgentRepresentation {
    address: string;
    signDigest: (digest: Buffer) => string;
}
/**
 * Represents the context in which messages are handled and processed.
 */
declare abstract class Context {
    /**
     * Get the agent representation associated with the context.
     */
    abstract get agent(): AgentRepresentation;
    /**
     * Get the key-value store associated with the context.
     */
    abstract get storage(): KeyValueStore;
    /**
     * Get the ledger client associated with the context.
     */
    abstract get ledger(): SigningStargateClient;
    /**
     * Get the logger instance associated with the context.
     */
    abstract get logger(): Logger;
    /**
     * Get the session UUID associated with the context.
     */
    abstract get session(): string;
    /**
     * Retrieve a list of agent addresses using a specific protocol digest.
     *
     * @param protocolDigest The protocol digest to search for, starting with "proto:".
     * @param limit The maximum number of agent addresses to return.
     * @param logger Optional logger instance.
     */
    abstract getAgentsByProtocol(protocolDigest: string, limit?: number, logger?: Logger): Promise<string[]>;
    /**
     * Broadcast a message to agents with a specific protocol.
     *
     * @param destinationProtocol The protocol to filter agents by.
     * @param message The message to broadcast.
     * @param limit The maximum number of agents to send the message to.
     * @param timeout The timeout for sending each message.
     */
    abstract broadcast(destinationProtocol: string, message: Model<any>, limit?: number, timeout?: number): Promise<MsgStatus[]>;
    /**
     * Send a message to the specified destination.
     *
     * @param destination The destination address to send the message to.
     * @param message The message to be sent.
     * @param sync Whether to send the message synchronously or asynchronously.
     * @param timeout The optional timeout for sending the message, in seconds.
     */
    abstract send(destination: string, message: Model<any>, sync?: boolean, timeout?: number): Promise<MsgStatus>;
    /**
     * Send a message to the specified destination where the message body and
     * message schema digest are sent separately.
     *
     * @param destination The destination address to send the message to.
     * @param messageSchemaDigest The schema digest of the message to be sent.
     * @param messageBody The JSON-encoded message body to be sent.
     * @param sync Whether to send the message synchronously or asynchronously.
     * @param timeout The optional timeout for sending the message, in seconds.
     * @param protocolDigest The protocol digest of the message to be sent.
     * @param queries The dictionary of queries to resolve.
     */
    abstract sendRaw(destination: string, messageSchemaDigest: string, messageBody: string, sync?: boolean, timeout?: number, protocolDigest?: string, queries?: Map<string, Promise<any>>): Promise<MsgStatus>;
    /**
     * Send a message to the wallet of the specified destination.
     *
     * @param destination The destination address to send the message to.
     * @param text The text of the message to be sent.
     * @param msgType The type of the message to be sent.
     */
    abstract sendWalletMessage(destination: string, text: string, msgType?: number): Promise<void>;
}
/**
 * Represents the internal context for proactive behaviour.
 */
declare class InternalContext extends Context {
    protected _agent: AgentRepresentation;
    protected _storage: KeyValueStore;
    protected _ledger: SigningStargateClient;
    protected _resolver: Resolver;
    protected _dispenser: Dispenser;
    protected _logger?: Logger;
    protected _session: string;
    protected _intervalMessages?: Set<string>;
    protected _walletMessagingClient?: any;
    protected _outboundMessages: Map<string, [string, string]>;
    constructor(agent: AgentRepresentation, storage: KeyValueStore, ledger: SigningStargateClient, resolver: Resolver, dispenser: Dispenser, session?: string, intervalMessages?: Set<string>, walletMessagingClient?: any, logger?: Logger);
    get agent(): AgentRepresentation;
    get storage(): KeyValueStore;
    get ledger(): SigningStargateClient;
    get logger(): Logger;
    get session(): string;
    get outboundMessages(): Map<string, [string, string]>;
    /**
     * @deprecated Please use `ctx.agent.address` instead.
     */
    get address(): string;
    getAgentsByProtocol(protocolDigest: string, limit?: number, logger?: Logger): Promise<string[]>;
    broadcast(destinationProtocol: string, message: Model<any>, limit?: number, timeout?: number): Promise<MsgStatus[]>;
    /**
     * Check if the message is a valid interval message.
     */
    protected _isValidIntervalMessage(schemaDigest: string): boolean;
    /**
     * This is the pro-active send method which is used in on_event and
     * on_interval methods. In these methods, interval messages are set but
     * we don't have access properties that are only necessary in re-active
     * contexts, like 'replies', 'message_received', or 'protocol'.
     */
    send(destination: string, message: Model<any>, sync?: boolean, timeout?: number): Promise<MsgStatus>;
    /**
     * Send a message to the specified destination where the message body and
     * message schema digest are sent separately.
     */
    sendRaw(destination: string, messageSchemaDigest: string, messageBody: string, sync?: boolean, timeout?: number, protocolDigest?: string, queries?: Map<string, Promise<any>>): Promise<MsgStatus>;
    /**
     * Queue an envelope for processing.
     */
    protected _queueEnvelope(envelope: Envelope, endpoints: string[], responseFuture: Promise<any>, sync?: boolean): void;
    /**
     * Send a message to the wallet of the specified destination.
     */
    sendWalletMessage(destination: string, text: string, msgType?: number): Promise<void>;
}
/**
 * Represents the reactive context in which messages are handled and processed.
 */
declare class ExternalContext extends InternalContext {
    private _queries;
    private _replies?;
    private _messageReceived;
    private _protocol;
    constructor(messageReceived: MsgDigest, agent: AgentRepresentation, storage: KeyValueStore, ledger: SigningStargateClient, resolver: Resolver, dispenser: Dispenser, queries?: Map<string, Promise<any>>, replies?: Map<string, Map<string, typeof Model>>, protocol?: [string, Protocol], session?: string, intervalMessages?: Set<string>, walletMessagingClient?: any, logger?: Logger);
    /**
     * Check if the message type is a valid reply to the message received.
     */
    private _isValidReply;
    /**
     * Send a message to the specified destination.
     * This is the re-active send method - at this point we have received a message
     * and have built a context. Replies, message_received, and protocol are set.
     */
    send(destination: string, message: Model<any>, sync?: boolean, timeout?: number): Promise<MsgStatus>;
}
type ContextType = InternalContext | ExternalContext;

type IntervalCallback = (context: Context) => Promise<void>;
type MessageCallback = (context: Context, sender: string, recoveredMessage: any) => Promise<void>;
type RestMethod = "GET" | "POST";
type AgentEndpoint = {
    url: string;
    weight: number;
};
type AddressPrefix = "agent" | "test-agent";
type AgentInfo = {
    agent_address: string;
    prefix: AddressPrefix;
    endpoints: AgentEndpoint[];
    protocols: string[];
    metadata: Record<string, string> | null;
};
/**
 * Delivery Status of a message
 */
declare enum DeliveryStatus {
    SENT = "sent",
    DELIVERED = "delivered",
    FAILED = "failed"
}
/**
 * Represents a message digest containing a message and its schema digest.
 * @prop {any} message The message content.
 * @prop {string} schema_digest The schema digest of the message.
 */
type MsgDigest = {
    message: any;
    schema_digest: string;
};
/**
 * Represents the status of a sent message.
 * @prop {DeliveryStatus} status The delivery status of the message {'sent', 'delivered', 'failed'}.
 * @prop {string} detail The details of the message delivery.
 * @prop {string} destination The destination address of the message.
 * @prop {string} endpoint The endpoint the message was sent to.
 * @prop {string | null} session The session ID of the message. Should be a valid UUID
 */
type MsgStatus = {
    status: DeliveryStatus;
    detail: string;
    destination: string;
    endpoint: string;
    session?: string;
};

/**
 * Standalone function to send a message to an agent.
 *
 * @param destination - The destination address to send the message to.
 * @param message - The message to be sent.
 * @param responseType - The optional type of the response message.
 * @param sender - The optional sender identity or user address.
 * @param resolver - The optional resolver for address-to-endpoint resolution.
 * @param timeout - The timeout for the message response in seconds. Defaults to 30.
 * @param sync - True if the message is synchronous.
 * @returns A promise that resolves to either a Model, JsonStr, MsgStatus, or Envelope.
 */
declare function sendMessage(destination: string, message: Model<any>, responseType?: any, sender?: Identity | string, resolver?: Resolver, timeout?: number, sync?: boolean): Promise<any>;
/**
 * Sends a synchronous message to an agent.
 *
 * @param destination - The destination address to send the message to.
 * @param message - The message to be sent, encapsulated in a Model instance.
 * @param responseType - The optional type of the response message.
 * @param sender - The optional sender identity or user address.
 * @param resolver - The optional resolver for address-to-endpoint resolution.
 * @param timeout - The timeout for the message response in seconds. Defaults to 30.
 * @returns A promise that resolves to either a Model, MsgStatus, or Envelope.
 */
declare function sendSyncMessage(destination: string, message: Model<any>, responseType?: any, sender?: Identity | string, resolver?: Resolver, timeout?: number): Promise<Model<any> | MsgStatus | Envelope>;
/**
 * Encloses a response message within an envelope.
 *
 * @param message - The response message to enclose, encapsulated in a Model instance.
 * @param sender - The sender's address.
 * @param session - The session identifier.
 * @param target - The target address. Defaults to an empty string.
 * @returns The JSON representation of the response envelope.
 */
declare function encloseResponse(message: Model<any>, sender: string, session: string, target?: string): string;
/**
 * Encloses a raw response message within an envelope.
 *
 * @param jsonMessage - The JSON-formatted response message to enclose.
 * @param schemaDigest - The schema digest of the message.
 * @param sender - The sender's address.
 * @param session - The session identifier.
 * @param target - The target address. Defaults to an empty string.
 * @returns The JSON representation of the response envelope.
 */
declare function encloseResponseRaw(jsonMessage: string, schemaDigest: string, sender: string, session: string, target?: string): string;

declare const AGENT_PREFIX = "agent";
declare const LEDGER_PREFIX = "fetch";
declare const USER_PREFIX = "user";
declare const TESTNET_PREFIX = "test-agent";
declare const MAINNET_PREFIX = "agent";
declare const AGENT_ADDRESS_LENGTH = 65;
declare const MAINNET_CONTRACT_ALMANAC = "fetch1mezzhfj7qgveewzwzdk6lz5sae4dunpmmsjr9u7z0tpmdsae8zmquq3y0y";
declare const TESTNET_CONTRACT_ALMANAC = "fetch1tjagw8g8nn4cwuw00cf0m5tl4l6wfw9c0ue507fhx9e3yrsck8zs0l3q4w";
declare const MAINNET_CONTRACT_NAME_SERVICE = "fetch1479lwv5vy8skute5cycuz727e55spkhxut0valrcm38x9caa2x8q99ef0q";
declare const TESTNET_CONTRACT_NAME_SERVICE = "fetch1mxz8kn3l5ksaftx8a9pj9a6prpzk2uhxnqdkwuqvuh37tw80xu6qges77l";
declare const REGISTRATION_FEE = "500000000000000000";
declare const REGISTRATION_DENOM = "atestfet";
declare const REGISTRATION_UPDATE_INTERVAL_SECONDS = 3600;
declare const REGISTRATION_RETRY_INTERVAL_SECONDS = 60;
declare const AVERAGE_BLOCK_INTERVAL = 6;
declare const ALMANAC_CONTRACT_VERSION = "2.3.0";
declare const AGENTVERSE_URL = "https://agentverse.ai";
declare const ALMANAC_API_URL = "https://agentverse.ai/v1/almanac";
declare const ALMANAC_API_TIMEOUT_SECONDS = 1;
declare const ALMANAC_API_MAX_RETRIES = 10;
declare const ALMANAC_REGISTRATION_WAIT = 100;
declare const MAILBOX_POLL_INTERVAL_SECONDS = 1;
declare const WALLET_MESSAGING_POLL_INTERVAL_SECONDS = 2;
declare const RESPONSE_TIME_HINT_SECONDS = 5;
declare const DEFAULT_ENVELOPE_TIMEOUT_SECONDS = 30;
declare const DEFAULT_MAX_ENDPOINTS = 10;
declare const DEFAULT_SEARCH_LIMIT = 100;
declare const TESTNET_RPC = "https://rpc-dorado.fetch.ai";
declare const MAINNET_RPC = "https://rpc-fetchhub.fetch.ai";
declare const TESTNET_FAUCET = "https://faucet-dorado.fetch.ai";
declare function parseEndpointConfig(endpoint: string | string[] | {
    [key: string]: any;
} | null): AgentEndpoint[];
declare function parseAgentverseConfig(config?: string | {
    [key: string]: any;
} | null): {
    agentMailboxKey: string | null;
    baseUrl: string;
    protocol: string;
    httpPrefix: string;
    useMailbox: boolean;
};

/**
 * Abstract base class for sinks that handle messages.
 */
declare abstract class Sink {
    abstract handleMessage(sender: string, schemaDigest: string, message: string, session: string): Promise<void>;
    abstract handleRest(method: RestMethod, endpoint: string, message: Model<any> | null): Promise<void>;
}
/**
 * Dispatches incoming messages to internal sinks.
 */
declare class Dispatcher {
    private _sinks;
    get sinks(): Map<string, Set<Sink>>;
    register(address: string, sink: Sink): void;
    unregister(address: string, sink: Sink): void;
    contains(address: string): boolean;
    dispatchMsg(sender: string, destination: string, schemaDigest: string, message: string, session: string): Promise<void>;
    dispatchRest(destination: string, method: RestMethod, endpoint: string, message: Model<any> | null): Promise<Model<any> | void>;
}
declare const dispatcher: Dispatcher;

declare const mailbox = "tmp";

declare const query = "tmp";

declare class AlmanacContractRecord implements AgentInfo {
    contract_address: string;
    sender_address: string;
    timestamp?: number;
    signature?: string;
    agent_address: string;
    endpoints: AgentEndpoint[];
    protocols: string[];
    prefix: AddressPrefix;
    metadata: Record<string, string> | null;
    constructor(data: Partial<AlmanacContractRecord>);
    sign(identity: Identity): void;
}
/**
 * A class representing the Almanac contract for agent registration.
 *
 * This class provides methods to interact with the Almanac contract, including
 * checking if an agent is registered, retrieving the expiry height of an agent's
 * registration, and getting the endpoints associated with an agent's registration.
 */
declare class AlmanacContract {
    private client;
    private address;
    constructor(client: CosmWasmClient, contractAddress: string);
    /**
     * Check if the contract version supported by this version of uAgents matches the
     * deployed version (major version must match).
     *
     * @returns True if the contract major version is supported, False otherwise
     */
    checkVersion(): Promise<boolean>;
    /**
     * Execute a query with additional checks and error handling.
     *
     * @param queryMsg - The query message
     * @returns The query response
     * @throws Error if the contract address is not set or the query fails
     */
    queryContract(queryMsg: Record<string, any>): Promise<any>;
    /**
     * Get the version of the contract.
     *
     * @returns The version of the contract
     */
    getContractVersion(): Promise<string>;
    /**
     * Get the contract address.
     *
     * @returns The contract address
     */
    getAddress(): string;
    /**
     * Check if an agent is registered in the Almanac contract.
     *
     * @param address - The agent's address
     * @returns True if the agent is registered, False otherwise
     */
    isRegistered(address: string): Promise<boolean>;
    /**
     * Check if an agent's registration needs to be updated.
     *
     * @param address - The agent's address
     * @param endpoints - The agent's endpoints
     * @param protocols - The agent's protocols
     * @param minSecondsLeft - The minimum time left before the agent's registration expires
     * @returns True if registration needs update, False otherwise
     */
    registrationNeedsUpdate(address: string, endpoints: AgentEndpoint[], protocols: string[], minSecondsLeft: number): Promise<boolean>;
    /**
     * Get the records associated with an agent's registration.
     *
     * @param address - The agent's address
     * @returns Tuple of [seconds to expiry, endpoints, protocols]
     */
    queryAgentRecord(address: string): Promise<[number, AgentEndpoint[], string[]]>;
    /**
     * Get the approximate seconds to expiry of an agent's registration.
     *
     * @param address - The agent's address
     * @returns The approximate seconds to expiry
     */
    getExpiry(address: string): Promise<number>;
    /**
     * Get the endpoints associated with an agent's registration.
     *
     * @param address - The agent's address
     * @returns The agent's registered endpoints
     */
    getEndpoints(address: string): Promise<AgentEndpoint[]>;
    /**
     * Get the protocols associated with an agent's registration.
     *
     * @param address - The agent's address
     * @returns The agent's registered protocols
     */
    getProtocols(address: string): Promise<string[]>;
    /**
     * Get the registration message for the contract.
     */
    private getRegistrationMsg;
    /**
     * Register an agent with the Almanac contract.
     *
     * @param client - The SigningCosmWasmClient instance
     * @param wallet - The agent's wallet
     * @param agentAddress - The agent's address
     * @param protocols - List of protocols
     * @param endpoints - List of endpoints
     * @param signature - The agent's signature
     * @param currentTime - Current timestamp
     */
    register(client: SigningCosmWasmClient, wallet: DirectSecp256k1HdWallet, agentAddress: string, protocols: string[], endpoints: AgentEndpoint[], signature: string, currentTime: number): Promise<void>;
    /**
     * Register multiple agents with the Almanac contract.
     *
     * @param client - The SigningCosmWasmClient instance
     * @param wallet - The wallet of the registration sender
     * @param agentRecords - The list of signed agent records to register
     */
    registerBatch(client: SigningCosmWasmClient, wallet: DirectSecp256k1HdWallet, agentRecords: AlmanacContractRecord[]): Promise<void>;
    /**
     * Get the agent's sequence number for Almanac registration.
     *
     * @param address - The agent's address
     * @returns The agent's sequence number
     */
    getSequence(address: string): Promise<number>;
}

declare abstract class AgentRegistrationPolicy {
    abstract register(agentIdentifier: string, protocols: string[], endpoints: AgentEndpoint[], metadata: Record<string, string> | null): Promise<void>;
}
declare abstract class BatchRegistrationPolicy {
    abstract addAgent(agentInfo: AgentInfo, identity: Identity): void;
    abstract register(): Promise<void>;
}
declare class AlmanacApiRegistrationPolicy extends AgentRegistrationPolicy {
    private identity;
    private almanacApi;
    private maxRetries;
    constructor(identity: Identity, almanacApi?: string);
    register(agentIdentifier: string, protocols: string[], endpoints: AgentEndpoint[], metadata?: Record<string, string> | null): Promise<void>;
}
declare class LedgerBasedRegistrationPolicy extends AgentRegistrationPolicy {
    private identity;
    private ledger;
    private wallet;
    private almanacContract;
    private testnet;
    constructor(identity: Identity, ledger: any, wallet: any, almanacContract: AlmanacContract, testnet: boolean);
    /**
     * Register the agent on the Almanac contract if registration is about to expire or
     * the registration data has changed.
     */
    register(agentIdentifier: string, protocols: string[], endpoints: AgentEndpoint[], metadata?: Record<string, string> | null): Promise<void>;
}
declare class BatchAlmanacApiRegistrationPolicy extends BatchRegistrationPolicy {
    private almanacApi;
    private attestations;
    private maxRetries;
    constructor(almanacApi?: string);
    addAgent(agentInfo: AgentInfo, identity: Identity): void;
    register(): Promise<void>;
}
declare class BatchLedgerRegistrationPolicy extends BatchRegistrationPolicy {
    private ledger;
    private wallet;
    private almanacContract;
    private testnet;
    private records;
    private identities;
    constructor(ledger: any, wallet: any, almanacContract: AlmanacContract, testnet: boolean);
    addAgent(agentInfo: AgentInfo, identity: Identity): void;
    private getBalance;
    register(): Promise<void>;
}
declare class DefaultRegistrationPolicy extends AgentRegistrationPolicy {
    private apiPolicy;
    private ledgerPolicy?;
    constructor(identity: Identity, ledger?: any, wallet?: any, almanacContract?: AlmanacContract, testnet?: boolean);
    register(agentAddress: string, protocols: string[], endpoints: AgentEndpoint[], metadata?: Record<string, string> | null): Promise<void>;
}
declare class DefaultBatchRegistrationPolicy extends BatchRegistrationPolicy {
    private apiPolicy;
    private ledgerPolicy?;
    constructor(ledger?: any, wallet?: any, almanacContract?: AlmanacContract, testnet?: boolean);
    addAgent(agentInfo: AgentInfo, identity: Identity): void;
    register(): Promise<void>;
}

declare const Wallet = "tmp";

export { AGENTVERSE_URL, AGENT_ADDRESS_LENGTH, AGENT_PREFIX, ALMANAC_API_MAX_RETRIES, ALMANAC_API_TIMEOUT_SECONDS, ALMANAC_API_URL, ALMANAC_CONTRACT_VERSION, ALMANAC_REGISTRATION_WAIT, ASGI, AVERAGE_BLOCK_INTERVAL, Agent, type AgentRepresentation, AlmanacApiRegistrationPolicy, AlmanacApiResolver, AlmanacContractResolver, BatchAlmanacApiRegistrationPolicy, BatchLedgerRegistrationPolicy, Context, type ContextType, DEFAULT_ENVELOPE_TIMEOUT_SECONDS, DEFAULT_MAX_ENDPOINTS, DEFAULT_SEARCH_LIMIT, DefaultBatchRegistrationPolicy, DefaultRegistrationPolicy, type Dispenser, Envelope, EnvelopeHistory, EnvelopeHistoryEntry, ErrorMessage, type ErrorMessageType, ExternalContext, GlobalResolver, Identity, InternalContext, KeyValueStore, LEDGER_PREFIX, LedgerBasedRegistrationPolicy, MAILBOX_POLL_INTERVAL_SECONDS, MAINNET_CONTRACT_ALMANAC, MAINNET_CONTRACT_NAME_SERVICE, MAINNET_PREFIX, MAINNET_RPC, Model, NameServiceResolver, Protocol, REGISTRATION_DENOM, REGISTRATION_FEE, REGISTRATION_RETRY_INTERVAL_SECONDS, REGISTRATION_UPDATE_INTERVAL_SECONDS, RESPONSE_TIME_HINT_SECONDS, Resolver, RulesBasedResolver, TESTNET_CONTRACT_ALMANAC, TESTNET_CONTRACT_NAME_SERVICE, TESTNET_FAUCET, TESTNET_PREFIX, TESTNET_RPC, USER_PREFIX, WALLET_MESSAGING_POLL_INTERVAL_SECONDS, Wallet, deriveKeyFromSeed, dispatcher, encloseResponse, encloseResponseRaw, encodeLengthPrefixed, generateUserAddress, isUserAddress, mailbox, parseAgentverseConfig, parseEndpointConfig, parseIdentifier, query, sendMessage, sendSyncMessage };
