import { types } from "util";
import { Agent } from "./Agent";
import { ASGI } from "./ASGI";
import { Communication } from "./Communication";
import { Config } from "./Config";
// import { Context } from "./Context"
import { Dispatch } from "./Dispatch";
import { Envelope } from "./Envelope";
import { mailbox } from "./Mailbox";
import { model } from "./model";
import { Protocol } from "./Protocol";
import { query } from "./Query";
import { Registration } from "./Registration";
import { Storage } from "./Storage";
import { Wallet } from "./Wallet";

const uAgents = {
  Agent,
  ASGI,
  Communication,
  Config,
  // Context,
  crypto,
  Dispatch,
  Envelope,
  mailbox,
  model,
  // Network,
  Protocol,
  query,
  Registration,
  // Resolver,
  // setup,
  Storage,
  types,
  // utils,
  Wallet,
};

export default uAgents;
