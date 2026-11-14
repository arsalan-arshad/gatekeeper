import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as authSchema from './auth-schema.js';
import * as schema from './schema.js';

export * from './auth-schema.js';
export * from './pgvector.js';
export * from './schema.js';
// migrate stays out of the package root export — Next.js webpack cannot resolve
// the runtime ../drizzle folder reference when bundling this package for web.

const fullSchema = { ...schema, ...authSchema };

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema: fullSchema });
}
