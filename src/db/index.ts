import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { seedDefaultUsers } from '../services/auth.service';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const connectionString = isTest ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(`Database connection string not configured for NODE_ENV=${process.env.NODE_ENV}`);
}

// Local/dev Postgres instances (e.g. localhost, docker) don't speak SSL; managed providers
// like Supabase/RDS require it. Infer from the host instead of hardcoding one or the other.
const isLocalHost = /^(localhost|127\.0\.0\.1|::1)$/i.test(new URL(connectionString).hostname);
const useSsl = process.env.DATABASE_SSL === 'true' || (!isLocalHost && process.env.DATABASE_SSL !== 'false');

export const pool = new Pool({
  connectionString,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

// SECURITY/RELIABILITY (HANDOFF.md §22): node-postgres emits 'error' on the
// pool itself when an *idle* client in the pool hits a network-level
// problem (a dropped connection, a transient DNS/network blip like
// ENETDOWN) - with no listener attached, Node's default behavior for an
// unhandled EventEmitter 'error' event is to crash the entire process.
// Confirmed this crashed a real running instance of this app during this
// session's testing (a genuine, if transient, network hiccup killed the
// whole server, not just the one in-flight request that happened to be
// using that connection). This listener doesn't change how errors on a
// request's own query are handled (those still reject their own promise
// normally, via `query()`/`getClient()` above) - it only stops a problem
// with an *idle, unused* pooled connection from taking the whole app down.
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle pool client (connection will be replaced automatically):', err.message);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 100) {
    console.warn(`[DB] Slow Query: ${text} took ${duration}ms`);
  }
  return res;
}

export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

/**
 * Initializes the database schema using the schema.sql file and seeds default accounts.
 */
export async function initializeDatabase() {
  const schemaPath = path.join(process.cwd(), 'src/db/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await query(schemaSql);
  console.log('[DB] Database schema initialized/verified.');
  if (process.env.NODE_ENV !== 'test') {
    await seedDefaultUsers();
  }
}

/**
 * Helper to clean tables (useful in testing)
 */
export async function cleanDatabase() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('cleanDatabase can only be called in test mode!');
  }
  await query('TRUNCATE users, refresh_tokens, crawl_jobs, crawl_results, campaigns, usage_logs, assets RESTART IDENTITY CASCADE;');
  await seedDefaultUsers();
}

/**
 * Closes the connection pool
 */
export async function closeDatabase() {
  await pool.end();
  console.log('[DB] Database connection pool closed.');
}
