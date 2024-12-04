import { z, ZodSchema } from "zod";
import crypto from "crypto";
import { extendZodWithOpenApi, createSchema } from "zod-openapi";
import { Model } from "./model";
import {
  IntervalCallback,
  MessageCallback,
} from "./types";

extendZodWithOpenApi(z);

const OPENAPI_VERSION = "3.0.2";

export class Protocol {
  /**
   * The Protocol class encapsulates a particular set of functionalities for an agent.
   * It typically relates to the exchange of messages between agents for executing some task.
   * It includes the message (model) types it supports, the allowed replies, and the
   * interval message handlers that define the logic of the protocol.
   */

  private _intervalHandlers: Array<[IntervalCallback, number]> = [];
  private _intervalMessages: Set<string> = new Set();
  private _signedMessageHandlers: Record<string, MessageCallback> = {};
  private _unsignedMessageHandlers: Record<string, MessageCallback> = {};
  private _models: Record<string, Model<any>> = {};
  private _replies: Record<string, Record<string, Model<any>>> = {};
  private _name: string;
  private _version: string;
  private _canonicalName: string;
  private _digest: string;

  private spec: {
    title: string;
    version: string;
    openapi_version: string;
  };

  constructor(name?: string, version?: string) {
    /**
     * Initialize a Protocol instance.
     *
     * Args:
     *     name (Optional[str], optional): The name of the protocol. Defaults to None.
     *     version (Optional[str], optional): The version of the protocol. Defaults to None.
     */
    this._name = name || "";
    this._version = version || "0.1.0";
    this._canonicalName = `${this._name}:${this._version}`;
    this._digest = "";

    this.spec = {
      title: this._name,
      version: this._version,
      openapi_version: OPENAPI_VERSION,
    };
  }

  get intervals() {
    /**
     * Property to access the interval handlers.
     *
     * Returns:
     *     List[Tuple[IntervalCallback, float]]: List of interval handlers and their periods.
     */
    return this._intervalHandlers;
  }

  get models() {
    /**
     * Property to access the registered models.
     *
     * Returns:
     *     Dict[str, Type[Model]]: Dictionary of registered models with schema digests as keys.
     */
    return this._models;
  }

  get replies() {
    /**
     * Property to access the registered replies.
     *
     * Returns:
     *     Dict[str, Dict[str, Type[Model]]]: Dictionary mapping message schema digests to their
     *     allowed replies.
     */
    return this._replies;
  }

  get intervalMessages() {
    /**
     * Property to access the interval message digests.
     *
     * Returns:
     *     Set[str]: Set of message digests that may be sent by interval handlers.
     */
    return this._intervalMessages;
  }

  get signedMessageHandlers() {
    /**
     * Property to access the signed message handlers.
     *
     * Returns:
     *     Dict[str, MessageCallback]: Dictionary mapping message schema digests to their handlers.
     */
    return this._signedMessageHandlers;
  }

  get unsignedMessageHandlers() {
    /**
     * Property to access the unsigned message handlers.
     *
     * Returns:
     *     Dict[str, MessageCallback]: Dictionary mapping message schema digests to their handlers.
     */
    return this._unsignedMessageHandlers;
  }

  get name() {
    /**
     * Property to access the protocol name.
     *
     * Returns:
     *     str: The protocol name.
     */
    return this._name;
  }

  get version() {
    /**
     * Property to access the protocol version.
     *
     * Returns:
     *     str: The protocol version.
     */
    return this._version;
  }

  get canonicalName() {
    /**
     * Property to access the canonical name of the protocol ('name:version').
     *
     * Returns:
     *     str: The canonical name of the protocol.
     */
    return this._canonicalName;
  }

  get digest() {
    /**
     * Property to access the digest of the protocol's manifest.
     *
     * Returns:
     *     str: The digest of the protocol's manifest.
     */
    return this.manifest().metadata.digest;
  }

  onInterval(period: number, messages?: Model<any> | Set<Model<any>>) {
    /**
     * Decorator to register an interval handler for the protocol.
     *
     * Args:
     *     period (float): The interval period in seconds.
     *     messages (Optional[Union[Type[Model], Set[Type[Model]]]], optional): The associated
     *     message types. Defaults to None.
     *
     * Returns:
     *     Callable: The decorator to register the interval handler.
     */
    return (func: IntervalCallback) => {
      this._addIntervalHandler(period, func, messages);
      return func;
    };
  }

  private _addIntervalHandler(
    period: number,
    func: IntervalCallback,
    messages?: Model<any> | Set<Model<any>>
  ) {
    /**
     * Add an interval handler to the protocol.
     *
     * Args:
     *     period (float): The interval period in seconds.
     *     func (IntervalCallback): The interval handler function.
     *     messages (Optional[Union[Type[Model], Set[Type[Model]]]]): The associated message types.
     */
    this._intervalHandlers.push([func, period]);

    if (messages) {
      const messageSet = messages instanceof Set ? messages : new Set([messages]);
      messageSet.forEach((message) => {
        const messageDigest = Model.buildSchemaDigest(message);
        this._intervalMessages.add(messageDigest);
      });
    }
  }

  onQuery(model: Model<any>, replies?: Model<any> | Set<Model<any>>) {
    /**
     * Decorator to register a query handler for the protocol.
     *
     * Args:
     *     model (Type[Model]): The message model type.
     *     replies (Optional[Union[Type[Model], Set[Type[Model]]]], optional): The associated
     *     reply types. Defaults to None.
     *
     * Returns:
     *     Callable: The decorator to register the query handler.
     */
    return this.onMessage(model, replies, true);
  }

  onMessage(
    model: Model<any>,
    replies?: Model<any> | Set<Model<any>>,
    allowUnverified: boolean = false
  ) {
    /**
     * Decorator to register a message handler for the protocol.
     *
     * Args:
     *     model (Type[Model]): The message model type.
     *     replies (Optional[Union[Type[Model], Set[Type[Model]]]], optional): The associated
     *     reply types. Defaults to None.
     *     allow_unverified (Optional[bool], optional): Whether to allow unverified messages.
     *     Defaults to False.
     *
     * Returns:
     *     Callable: The decorator to register the message handler.
     */
    return (func: MessageCallback) => {
      this._addMessageHandler(model, func, replies, allowUnverified);
      return func;
    };
  }

  private _addMessageHandler(
    model: Model<any>,
    func: MessageCallback,
    replies?: Model<any> | Set<Model<any>>,
    allowUnverified: boolean = false
  ) {
    /**
     * Add a message handler to the protocol.
     *
     * Args:
     *     model (Type[Model]): The message model type.
     *     func (MessageCallback): The message handler function.
     *     replies (Optional[Union[Type[Model], Set[Type[Model]]]]): The associated reply types.
     *     allow_unverified (Optional[bool], optional): Whether to allow unverified messages.
     *     Defaults to False.
     */
    const modelDigest = Model.buildSchemaDigest(model);

    this._models[modelDigest] = model;

    if (allowUnverified) {
      this._unsignedMessageHandlers[modelDigest] = func;
    } else {
      this._signedMessageHandlers[modelDigest] = func;
    }

    if (replies) {
      const replySet = replies instanceof Set ? replies : new Set([replies]);
      this._replies[modelDigest] = {};
      replySet.forEach((reply) => {
        const replyDigest = Model.buildSchemaDigest(reply);
        this._replies[modelDigest][replyDigest] = reply;
      });
    }
  }

  manifest(): Record<string, any> {
    /**
     * Generate the protocol's manifest, a long-form machine readable description of the
     * protocol details and interface.
     *
     * Returns:
     *     Dict[str, Any]: The protocol's manifest.
     */
    const metadata = {
      name: this._name,
      version: this._version,
    };

    const manifest = {
      version: "1.0",
      metadata: {},
      models: [],
      interactions: [],
    };

    const allModels: Record<string, Model<any>> = {};

    Object.entries(this._models).forEach(([digest, model]) => {
      if (!allModels[digest]) allModels[digest] = model;
    });

    Object.values(this._replies).forEach((replies) => {
      Object.entries(replies).forEach(([digest, model]) => {
        if (!allModels[digest]) allModels[digest] = model;
      });
    });

    Object.entries(allModels).forEach(([digest, model]) => {
      manifest.models.push({
        digest,
        schema: model.schema(),
      });
    });

    Object.entries(this._replies).forEach(([request, responses]) => {
      manifest.interactions.push({
        type: this._unsignedMessageHandlers[request] ? "query" : "normal",
        request,
        responses: Object.keys(responses),
      });
    });

    const encoded = JSON.stringify(manifest, null, 0);
    metadata["digest"] = `proto:${crypto.createHash("sha256").update(encoded).digest("hex")}`;

    const finalManifest = { ...manifest, metadata };

    return finalManifest;
  }

  static computeDigest(manifest: Record<string, any>): string {
    /**
     * Compute the digest of a given manifest.
     *
     * Args:
     *     manifest (Dict[str, Any]): The manifest to compute the digest for.
     *
     * Returns:
     *     str: The computed digest.
     */
    const cleanedManifest = { ...manifest, metadata: {} };
    const encoded = JSON.stringify(cleanedManifest, null, 0);
    return `proto:${crypto.createHash("sha256").update(encoded).digest("hex")}`;
  }
}
