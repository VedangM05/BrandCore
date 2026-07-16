import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
  const url = process.env.DATABASE_URL;
  console.log('[Diagnostic] Checking connection to:', url);
  
  if (!url) {
    console.error('[Diagnostic] DATABASE_URL is not set in .env!');
    process.exit(1);
  }

  if (url.startsWith('http')) {
    console.error('[Diagnostic] ERROR: Your DATABASE_URL starts with "http/https". The pg driver requires a standard PostgreSQL connection URI starting with "postgresql://" or "postgres://".');
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('[Diagnostic] SUCCESS: Successfully connected to the PostgreSQL database!');
    
    // Check if we can run a simple query
    const res = await client.query('SELECT version();');
    console.log('[Diagnostic] PostgreSQL Version:', res.rows[0].version);
    
    await client.end();
    process.exit(0);
  } catch (error: any) {
    console.error('[Diagnostic] CONNECTION FAILED:', error.message);
    process.exit(1);
  }
}

check();
