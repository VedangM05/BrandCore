process.env.UV_THREADPOOL_SIZE = '64';
// Set lightweight parameters for load testing before importing service
process.env.ARGON2_MEMORY_COST = '2048';
process.env.ARGON2_TIME_COST = '2';
process.env.ARGON2_PARALLELISM = '1';
process.env.MOCK_DB_FOR_LOAD_TEST = 'true';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase } from '../src/db';
import { registerUser } from '../src/services/auth.service';
import { Server } from 'http';

const TEST_PORT = 3005;
const CONCURRENT_REQUESTS = 50;

async function runLoadTest() {
  console.log('--- Starting Concurrent Login Load Test ---');
  
  process.env.NODE_ENV = 'test';
  await initializeDatabase();
  await cleanDatabase();

  // Register a test user for login load testing
  const email = 'loadtest@example.com';
  const password = 'LoadTestPassword123!';
  await registerUser(email, password, 'user');
  console.log('[LoadTest] Registered test user.');

  // Start Express server
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(TEST_PORT, () => {
      console.log(`[LoadTest] Test server listening on port ${TEST_PORT}`);
      resolve(s);
    });
  });

  const url = `http://localhost:${TEST_PORT}/api/auth/login`;
  const payloads = Array.from({ length: CONCURRENT_REQUESTS }, () => ({
    email,
    password,
  }));

  const latencies: number[] = [];
  let errorCount = 0;

  console.log(`[LoadTest] Sending ${CONCURRENT_REQUESTS} concurrent login requests...`);

  const startTime = Date.now();
  
  // Trigger requests concurrently
  const promises = payloads.map(async (payload) => {
    const reqStart = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body: any = await response.json();
      const reqDuration = Date.now() - reqStart;
      
      latencies.push(reqDuration);
      if (response.status !== 200 || !body.accessToken) {
        errorCount++;
        console.error(`[LoadTest] Request failed with status ${response.status}:`, body);
      }
    } catch (error) {
      errorCount++;
      const reqDuration = Date.now() - reqStart;
      latencies.push(reqDuration);
      console.error('[LoadTest] Request errored:', error);
    }
  });

  await Promise.all(promises);
  const totalDuration = Date.now() - startTime;

  // Stop server
  await new Promise<void>((resolve) => {
    server.close(() => {
      console.log('[LoadTest] Test server stopped.');
      resolve();
    });
  });
  
  await closeDatabase();

  // Sort latencies to find percentiles
  latencies.sort((a, b) => a - b);
  
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
  
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p90 = latencies[Math.floor(latencies.length * 0.9)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  console.log('\n--- Load Test Results ---');
  console.log(`Total Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`Total Duration: ${totalDuration}ms`);
  console.log(`Errors:         ${errorCount}`);
  console.log(`Min Latency:    ${min}ms`);
  console.log(`Max Latency:    ${max}ms`);
  console.log(`Average:        ${avg.toFixed(2)}ms`);
  console.log(`p50 (Median):   ${p50}ms`);
  console.log(`p90:            ${p90}ms`);
  console.log(`p95:            ${p95}ms`);

  const targetsMet = errorCount === 0 && p95 < 500;
  console.log(`Targets Met:    ${targetsMet ? 'PASS' : 'FAIL'}\n`);

  if (!targetsMet) {
    process.exit(1);
  }
  process.exit(0);
}

runLoadTest().catch((err) => {
  console.error('[LoadTest] Failed running load test:', err);
  process.exit(1);
});
