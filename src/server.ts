process.env.UV_THREADPOOL_SIZE = '64';
// OpenTelemetry must be initialized BEFORE importing any other modules
import { initializeTelemetry } from './instrumentation';
initializeTelemetry();

import app from './app';
import { initializeDatabase } from './db';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
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
