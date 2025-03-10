import {
  ALMANAC_API_URL,
  ALMANAC_API_MAX_RETRIES,
  ALMANAC_API_TIMEOUT_SECONDS,
  ALMANAC_CONTRACT_VERSION,
  ALMANAC_REGISTRATION_WAIT,
  REGISTRATION_FEE,
  REGISTRATION_UPDATE_INTERVAL_SECONDS,
} from "./Config";
import * as crypto from 'crypto'
import { Identity } from "./crypto";
import { AgentEndpoint, AgentInfo } from "./types";
import { AlmanacContract, addTestnetFunds, InsufficientFundsError } from "./Network";
import { log, getLogger, LogLevel } from "./utils";
import { parseIdentifier } from "./Resolver";

const logger = getLogger(LogLevel.INFO, "AgentRegistration");

/**
 * Generate a backoff time starting from 0.128 seconds and limited to ~131 seconds
 */
function generateBackoffTime(retry: number): number {
  return Math.min(2 ** (retry + 6), 131072) / 1000;
}

function JSONstringifyOrder(obj: any)
{
    const allKeys: Set<string> = new Set();
    JSON.stringify(obj, (key, value) => (allKeys.add(key), value));
    return JSON.stringify(obj, Array.from(allKeys).sort());
}

interface VerifiableModel {
  agent_identifier: string;
  signature?: string;
  timestamp?: number;

  sign(identity: Identity): void;
  verify(identity: Identity): void;
}

abstract class BaseVerifiableModel implements VerifiableModel {
  agent_identifier: string;
  signature?: string;
  timestamp?: number;

  constructor(agentIdentifier: string) {
    this.agent_identifier = agentIdentifier;
  }

  /**
   * Sign the current model with the provided Identity.
   */
  sign(identity: Identity) {
    this.timestamp = Math.floor(Date.now() / 1000);
    const digest = this._buildDigest();
    this.signature = identity.signDigest(digest);
  }

    /**
   * Verify the signature using the provided Identity.
   */
    verify(): void {
      if (!this.signature) {
        throw new Error('signature is missing');
      }
      Identity.verifyDigest(this.agent_identifier, this._buildDigest(), this.signature);
    }

  /**
   * Build the cryptographic digest of the model for signing/verification.
   */
  private _buildDigest(): Buffer {
    const jsonRepresentation = JSONstringifyOrder({
      ...this,
      signature: undefined,
    });

    const sha256 = crypto.createHash('sha256');
    sha256.update(jsonRepresentation, 'utf-8');
    return sha256.digest();
  }
}

class AgentRegistrationAttestation extends BaseVerifiableModel {
  protocols: string[];
  endpoints: AgentEndpoint[];
  metadata: Record<string, string> | null;

  constructor(
    agentIdentifier: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    metadata: Record<string, string> | null = null
  ) {
    super(agentIdentifier);
    this.protocols = protocols;
    this.endpoints = endpoints;
    this.metadata = metadata;
  }
}

class AgentRegistrationAttestationBatch {
  attestations: AgentRegistrationAttestation[];

  constructor(attestations: AgentRegistrationAttestation[]) {
    this.attestations = attestations;
  }
}

class AgentStatusUpdate extends BaseVerifiableModel {
  isActive: boolean;

  constructor(agentAddress: string, isActive: boolean) {
    super(agentAddress);
    this.isActive = isActive;
  }
}

async function almanacApiPost(
  url: string,
  data: any,
  retries: number = ALMANAC_API_MAX_RETRIES
): Promise<boolean> {
  for (let retry = 0; retry < retries; retry++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        return true;
      } else {
        log(`API responded with ${response.status}: ${await response.text()}`, logger);
      }
    } catch (error) {
      if (retry === retries - 1) {
        log(`Failed after ${retries} retries: ${error}`, logger);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, generateBackoffTime(retry)));
    }
  }
  return false;
}

abstract class AgentRegistrationPolicy {
  abstract register(
    agentIdentifier: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    metadata: Record<string, string> | null
  ): Promise<void>;
}

abstract class BatchRegistrationPolicy {
  abstract addAgent(agentInfo: AgentInfo, identity: Identity): void;
  abstract register(): Promise<void>;
}

export class AlmanacApiRegistrationPolicy extends AgentRegistrationPolicy {
  private identity: Identity;
  private almanacApi: string;
  private maxRetries: number;

  constructor(identity: Identity, almanacApi: string = ALMANAC_API_URL) {
    super();
    this.identity = identity;
    this.almanacApi = almanacApi;
    this.maxRetries = ALMANAC_API_MAX_RETRIES;
  }

  async register(
    agentIdentifier: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    metadata: Record<string, string> | null = null
  ): Promise<void> {
    const attestation = new AgentRegistrationAttestation(
      agentIdentifier,
      protocols,
      endpoints,
      metadata
    );
    attestation.sign(this.identity);

    const success = await almanacApiPost(`${this.almanacApi}/agents`, attestation, this.maxRetries);
    if (success) {
      log("Registration on Almanac API successful", logger);
    } else {
      throw new Error("Registration on Almanac API failed");
    }
  }
}

export class LedgerBasedRegistrationPolicy extends AgentRegistrationPolicy {
  private identity: Identity;
  private ledger: any;
  private wallet: any;
  private almanacContract: AlmanacContract;
  private testnet: boolean;

  constructor(
    identity: Identity,
    ledger: any,
    wallet: any,
    almanacContract: AlmanacContract,
    testnet: boolean
  ) {
    super();
    this.identity = identity;
    this.ledger = ledger;
    this.wallet = wallet;
    this.almanacContract = almanacContract;
    this.testnet = testnet;
  }

  /**
   * Check the version of the deployed Almanac contract and log a warning
   * if it is different from the supported version.
   */
  private async checkContractVersion() {
    const deployedVersion = await this.almanacContract.getContractVersion();
    if (deployedVersion !== ALMANAC_CONTRACT_VERSION) {
      log(
        `Contract version mismatch: deployed=${deployedVersion}, supported=${ALMANAC_CONTRACT_VERSION}`,
        logger
      );
    }
  }

  /**
   * Register the agent on the Almanac contract if registration is about to expire or
   * the registration data has changed.
   */
  async register(
    agentIdentifier: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    metadata: Record<string, string> | null = null
  ): Promise<void> {
    await this.checkContractVersion();

    const agentAddress = parseIdentifier(agentIdentifier)[2];
    const isRegistered = await this.almanacContract.isRegistered(agentAddress);
    const expiry = await this.almanacContract.getExpiry(agentAddress);
    const currentEndpoints = await this.almanacContract.getEndpoints(agentAddress);
    const currentProtocols = await this.almanacContract.getProtocols(agentAddress);

    if (
      !isRegistered ||
      expiry < REGISTRATION_UPDATE_INTERVAL_SECONDS ||
      JSON.stringify(endpoints) !== JSON.stringify(currentEndpoints) ||
      JSON.stringify(protocols) !== JSON.stringify(currentProtocols)
    ) {
      const balance = await this.ledger.queryBankBalance(this.wallet.address());
      if (balance < parseInt(REGISTRATION_FEE)) {
        if (this.testnet) {
          await addTestnetFunds(this.wallet.address());
        } else {
          throw new InsufficientFundsError("Not enough funds for registration.");
        }
      }

      log("Registering on Almanac contract...", logger);
      const timestamp = Math.floor(Date.now() / 1000) - ALMANAC_REGISTRATION_WAIT;
      const signature = this.identity.signRegistration(
        this.almanacContract.getAddress(),
        timestamp,
        this.wallet.address()
      );

      await this.almanacContract.register(
        this.ledger,
        this.wallet,
        agentAddress,
        protocols,
        endpoints,
        signature,
        timestamp
      );
      log("Registration on Almanac contract complete", logger);
    } else {
      log("Almanac contract registration is up to date", logger);
    }
  }
}

export class BatchAlmanacApiRegistrationPolicy extends BatchRegistrationPolicy {
  private almanacApi: string;
  private attestations: AgentRegistrationAttestation[];
  private maxRetries: number;

  constructor(almanacApi: string = ALMANAC_API_URL) {
    super();
    this.almanacApi = almanacApi;
    this.attestations = [];
    this.maxRetries = ALMANAC_API_MAX_RETRIES;
  }

  addAgent(agentInfo: AgentInfo, identity: Identity): void {
    const attestation = new AgentRegistrationAttestation(
      `${agentInfo.prefix}://${agentInfo.agent_address}`,
      agentInfo.protocols,
      agentInfo.endpoints,
      agentInfo.metadata,
    );
    attestation.sign(identity);
    this.attestations.push(attestation);
  }

  async register(): Promise<void> {
    if (this.attestations.length === 0) {
      log("No agents to register in batch.", logger);
      return;
    }

    const batch = new AgentRegistrationAttestationBatch(this.attestations);

    const success = await almanacApiPost(`${this.almanacApi}/agents/batch`, batch, this.maxRetries);
    if (success) {
      log("Batch registration on Almanac API successful", logger);
    } else {
      throw new Error("Batch registration on Almanac API failed");
    }
  }
}

export class BatchLedgerRegistrationPolicy extends BatchRegistrationPolicy {
  private ledger: any;
  private wallet: any;
  private almanacContract: AlmanacContract;
  private testnet: boolean;
  private records: any[];
  private identities: Record<string, Identity>;

  constructor(
    ledger: any,
    wallet: any,
    almanacContract: AlmanacContract,
    testnet: boolean
  ) {
    super();
    this.ledger = ledger;
    this.wallet = wallet;
    this.almanacContract = almanacContract;
    this.testnet = testnet;
    this.records = [];
    this.identities = {};
  }

  addAgent(agentInfo: AgentInfo, identity: Identity): void {
    const record = {
      agentAddress: agentInfo.agent_address,
      protocols: agentInfo.protocols,
      endpoints: agentInfo.endpoints,
      contractAddress: this.almanacContract.getAddress(),
      senderAddress: this.wallet.address(),
    };
    this.records.push(record);
    this.identities[agentInfo.agent_address] = identity;
  }

  private async getBalance(): Promise<number> {
    return await this.ledger.queryBankBalance(this.wallet.address());
  }

  async register(): Promise<void> {
    if (this.records.length === 0) {
      log("No agents to register in batch.", logger);
      return;
    }

    const balance = await this.getBalance();
    if (balance < parseInt(REGISTRATION_FEE) * this.records.length) {
      log(
        `Insufficient funds to register ${this.records.length} agents.`,
        logger
      );
      if (this.testnet) {
        await addTestnetFunds(this.wallet.address());
        log("Testnet funds added.", logger);
      } else {
        throw new InsufficientFundsError("Not enough funds for batch registration.");
      }
    }

    for (const record of this.records) {
      const identity = this.identities[record.agentAddress];
      if (!identity) {
        throw new Error(`Identity for agentAddress ${record.agentAddress} is not defined.`);
      }
      const timestamp = Math.floor(Date.now() / 1000) - ALMANAC_REGISTRATION_WAIT;
      record.signature = identity.signRegistration(
        record.contractAddress,
        timestamp,
        record.senderAddress
      );
    }

    await this.almanacContract.registerBatch(this.ledger, this.wallet, this.records);
    log("Batch registration on Almanac contract complete.", logger);
  }
}

export class DefaultRegistrationPolicy extends AgentRegistrationPolicy {
  private apiPolicy: AlmanacApiRegistrationPolicy;
  private ledgerPolicy?: LedgerBasedRegistrationPolicy;

  constructor(
    identity: Identity,
    ledger?: any,
    wallet?: any,
    almanacContract?: AlmanacContract,
    testnet: boolean = true
  ) {
    super();
    this.apiPolicy = new AlmanacApiRegistrationPolicy(identity);

    if (ledger && wallet && almanacContract) {
      this.ledgerPolicy = new LedgerBasedRegistrationPolicy(
        identity,
        ledger,
        wallet,
        almanacContract,
        testnet
      );
    }
  }

  async register(
    agentAddress: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    metadata: Record<string, string> | null = null
  ): Promise<void> {
    try {
      await this.apiPolicy.register(agentAddress, protocols, endpoints, metadata);
    } catch (error) {
      log(`API registration failed: ${error}`, logger);
    }

    if (this.ledgerPolicy) {
      try {
        await this.ledgerPolicy.register(agentAddress, protocols, endpoints, metadata);
      } catch (error) {
        log(`Ledger registration failed: ${error}`, logger);
      }
    }
  }
}

export class DefaultBatchRegistrationPolicy extends BatchRegistrationPolicy {
  private apiPolicy: BatchAlmanacApiRegistrationPolicy;
  private ledgerPolicy?: BatchLedgerRegistrationPolicy;

  constructor(
    ledger?: any,
    wallet?: any,
    almanacContract?: AlmanacContract,
    testnet: boolean = true
  ) {
    super();
    this.apiPolicy = new BatchAlmanacApiRegistrationPolicy();

    if (ledger && wallet && almanacContract) {
      this.ledgerPolicy = new BatchLedgerRegistrationPolicy(
        ledger,
        wallet,
        almanacContract,
        testnet
      );
    }
  }

  addAgent(agentInfo: AgentInfo, identity: Identity): void {
    this.apiPolicy.addAgent(agentInfo, identity);
    if (this.ledgerPolicy) {
      this.ledgerPolicy.addAgent(agentInfo, identity);
    }
  }

  async register(): Promise<void> {
    try {
      await this.apiPolicy.register();
    } catch (error) {
      log(`API batch registration failed: ${error}`, logger);
    }

    if (this.ledgerPolicy) {
      try {
        await this.ledgerPolicy.register();
      } catch (error) {
        log(`Ledger batch registration failed: ${error}`, logger);
      }
    }
  }
}
