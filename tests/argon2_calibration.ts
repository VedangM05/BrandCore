import * as argon2 from 'argon2';

async function runCalibration() {
  const configs = [
    { memoryCost: 65536, timeCost: 3, parallelism: 4 },
    { memoryCost: 65536, timeCost: 2, parallelism: 4 },
    { memoryCost: 32768, timeCost: 3, parallelism: 4 },
    { memoryCost: 32768, timeCost: 2, parallelism: 4 },
    { memoryCost: 16384, timeCost: 3, parallelism: 4 },
    { memoryCost: 16384, timeCost: 2, parallelism: 4 },
    { memoryCost: 16384, timeCost: 1, parallelism: 4 },
  ];

  console.log('--- Calibrating Argon2 Parameters ---');
  for (const config of configs) {
    const start = Date.now();
    await argon2.hash('test_password', {
      type: argon2.argon2id,
      ...config
    });
    const duration = Date.now() - start;
    console.log(`Config: memory=${config.memoryCost}, time=${config.timeCost}, parallelism=${config.parallelism} => Duration: ${duration}ms`);
  }
}

runCalibration().catch(console.error);
