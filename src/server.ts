process.env.UV_THREADPOOL_SIZE = '64';
// OpenTelemetry must be initialized BEFORE importing any other modules
import { initializeTelemetry } from './instrumentation';
initializeTelemetry();

import app from './app';
import { initializeDatabase } from './db';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

// SECURITY: auth.service.ts / auth.middleware.ts fall back to hardcoded
// JWT secrets ('access_secret'/'refresh_secret') when the env vars aren't
// set - fine for local dev (nothing enforces this repo's own secrets are
// used), but this repo is public, so those defaults are effectively known
// to anyone. Refuse to boot in production with them missing or left at a
// known-insecure default (including docker-compose.yml's own dev
// placeholders), rather than silently signing real tokens with a secret
// anyone can guess.
function assertProductionSecretsAreReal(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const insecureDefaults = new Set([
    '', 'access_secret', 'refresh_secret',
    'dev_access_secret_change_me', 'dev_refresh_secret_change_me',
  ]);
  const accessSecret = process.env.JWT_ACCESS_SECRET || '';
  const refreshSecret = process.env.JWT_REFRESH_SECRET || '';
  if (insecureDefaults.has(accessSecret) || insecureDefaults.has(refreshSecret)) {
    console.error(
      '[Server] Refusing to start: NODE_ENV=production but JWT_ACCESS_SECRET/' +
      'JWT_REFRESH_SECRET are missing or still set to a known default. Set real ' +
      'secrets (e.g. via .env or your deployment platform\'s secret manager) before ' +
      'running in production.'
    );
    process.exit(1);
  }
}

async function startServer() {
  assertProductionSecretsAreReal();
  try {
    // Proactively initialize database tables on boot
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`[Server] BrandCore Auth & User Management module listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('[Server] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
