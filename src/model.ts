import { ZodSchema } from 'zod';
import crypto from 'crypto';

export class Model<T> {
  private schema: ZodSchema<T>;

  constructor(schema: ZodSchema<T>) {
    this.schema = schema;
  }

  validate(obj: T): T {
    return this.schema.parse(obj);
  }

  dumpJson(data: T): string {
    return JSON.stringify(data);
  }

  dump(data: T): T {
    return data;
  }

  buildSchemaDigest(): string {
    const schemaDef = JSON.stringify(this.schema._def);
    const digest = crypto.createHash('sha256').update(schemaDef).digest('hex');
    return `model:${digest}`;
  }
}