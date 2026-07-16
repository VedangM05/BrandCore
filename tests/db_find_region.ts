import { Client } from 'pg';

const regions = [
  'ap-south-1',       // Mumbai
  'ap-southeast-1',   // Singapore
  'us-east-1',        // N. Virginia
  'eu-central-1',     // Frankfurt
  'eu-west-1',        // Ireland
  'us-west-2'         // Oregon
];

async function findRegion() {
  const projectRef = 'iwxvnggbpaecbtjemmbo';
  const password = 'qWEASZ@789123';
  
  console.log(`[RegionFinder] Testing poolers for project ${projectRef}...`);
  
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${host}:6543/postgres`;
    
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 3000,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      await client.connect();
      console.log(`\n[RegionFinder] SUCCESS! Connected successfully to region: ${region}`);
      console.log(`[RegionFinder] Host: ${host}`);
      await client.end();
      process.exit(0);
    } catch (err: any) {
      if (err.message.includes('tenant/user') && err.message.includes('not found')) {
        console.log(`[RegionFinder] Region ${region} - Tenant not found (Incorrect region)`);
      } else if (err.message.includes('password authentication failed')) {
        console.log(`\n[RegionFinder] SUCCESS! Connected to region ${region}, but password authentication failed. This is the correct region!`);
        console.log(`[RegionFinder] Host: ${host}`);
        process.exit(0);
      } else {
        console.log(`[RegionFinder] Region ${region} - Failed with error: ${err.message}`);
      }
    }
  }
  
  console.error('\n[RegionFinder] ERROR: Could not find the correct region. Please check your Supabase dashboard settings.');
  process.exit(1);
}

findRegion();
