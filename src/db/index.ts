import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const connectionString = isTest ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(`Database connection string not configured for NODE_ENV=${process.env.NODE_ENV}`);
}

export const pool = new Pool({
  connectionString,
  max: 50, // Max pool size suitable for load testing
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // Proactively log long queries if they exceed 100ms
  if (duration > 100) {
    console.warn(`[DB] Slow Query: ${text} took ${duration}ms`);
  }
  return res;
}

export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

/**
 * Initializes the database schema using the schema.sql file.
 */
export async function initializeDatabase() {
  const schemaPath = path.join(process.cwd(), 'src/db/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await query(schemaSql);
  console.log('[DB] Database schema initialized/verified.');
}

/**
 * Helper to clean tables (useful in testing)
 */
export async function cleanDatabase() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('cleanDatabase can only be called in test mode!');
  }
  await query('TRUNCATE users, refresh_tokens RESTART IDENTITY CASCADE;');
}

/**
 * Closes the connection pool
 */
export async function closeDatabase() {
  await pool.end();
  console.log('[DB] Database connection pool closed.');
}
