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

const logger = getLogger(LogLevel.INFO, "AgentRegistration");

function generateBackoffTime(retry: number): number {
  return Math.min(2 ** (retry + 6), 131072) / 1000;
}

interface VerifiableModel {
  agentAddress: string;
  signature?: string;
  timestamp?: number;

  sign(identity: Identity): void;
  verify(identity: Identity): boolean;
}

abstract class BaseVerifiableModel implements VerifiableModel {
  agentAddress: string;
  signature?: string;
  timestamp?: number;

  constructor(agentAddress: string) {
    this.agentAddress = agentAddress;
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
    verify(identity: Identity): boolean {
      if (!this.signature) {
        return false;
      }
      return Identity.verifyDigest(this.agentAddress, this._buildDigest(), this.signature);
    }

  /**
   * Build the cryptographic digest of the model for signing/verification.
   */
  private _buildDigest(): Buffer {
    const jsonRepresentation = JSON.stringify({
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
  metadata?: Record<string, string>;

  constructor(
    agentAddress: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    metadata?: Record<string, string>
  ) {
    super(agentAddress);
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
        log(`API responded with status ${response.status}`, logger);
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
    agentAddress: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    metadata?: Record<string, string>
  ): Promise<void>;
}

abstract class BatchRegistrationPolicy {
  abstract addAgent(agentInfo: AgentInfo, identity: Identity): void;
  abstract register(): Promise<void>;
}

class AlmanacApiRegistrationPolicy extends AgentRegistrationPolicy {
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
    agentAddress: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    metadata?: Record<string, string>
  ): Promise<void> {
    const attestation = new AgentRegistrationAttestation(
      agentAddress,
      protocols,
      endpoints,
      metadata
    );
    attestation.sign(this.identity);

    const success = await almanacApiPost(`${this.almanacApi}/agents`, attestation);
    if (success) {
      log("Registration on Almanac API successful", logger);
    } else {
      log("Registration on Almanac API failed", logger);
    }
  }
}

class LedgerBasedRegistrationPolicy extends AgentRegistrationPolicy {
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

  private async checkContractVersion() {
    const deployedVersion = await this.almanacContract.getContractVersion();
    if (deployedVersion !== ALMANAC_CONTRACT_VERSION) {
      log(
        `Contract version mismatch: deployed=${deployedVersion}, supported=${ALMANAC_CONTRACT_VERSION}`,
        logger
      );
    }
  }

  async register(
    agentAddress: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    metadata?: Record<string, string>
  ): Promise<void> {
    await this.checkContractVersion();

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

class DefaultRegistrationPolicy extends AgentRegistrationPolicy {
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
    metadata?: Record<string, string>
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
