import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as authSchema from './auth-schema.js';
import * as schema from './schema.js';

export * from './auth-schema.js';
export * from './migrate.js';
export * from './pgvector.js';
export * from './schema.js';

const fullSchema = { ...schema, ...authSchema };

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema: fullSchema });
}
