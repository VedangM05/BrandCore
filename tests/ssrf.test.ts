import { checkUrlSafeToFetch } from '../src/services/ssrf.service';

// checkUrlSafeToFetch has a NODE_ENV==='test' bypass (see its own docstring
// - dna.test.ts's mock crawl server needs to reach localhost, exactly the
// shape this guard exists to block for real). To actually exercise the
// real blocking logic, these tests temporarily unset NODE_ENV around each
// call and restore it immediately after - the same real check
// production traffic goes through, not the test-mode escape hatch.
describe('SSRF guard (checkUrlSafeToFetch)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  async function checkAsProduction(url: string) {
    delete (process.env as any).NODE_ENV;
    try {
      return await checkUrlSafeToFetch(url);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('allows a normal public https URL', async () => {
    const res = await checkAsProduction('https://example.com');
    expect(res.safe).toBe(true);
  });

  it('blocks a direct loopback IP literal (127.0.0.1)', async () => {
    const res = await checkAsProduction('http://127.0.0.1:8080/');
    expect(res.safe).toBe(false);
  });

  it('blocks "localhost" by name', async () => {
    const res = await checkAsProduction('http://localhost:3000/');
    expect(res.safe).toBe(false);
  });

  it('blocks the AWS/GCP cloud metadata address (169.254.169.254)', async () => {
    const res = await checkAsProduction('http://169.254.169.254/latest/meta-data/');
    expect(res.safe).toBe(false);
  });

  it('blocks RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x)', async () => {
    const results = await Promise.all([
      checkAsProduction('http://10.0.0.5/'),
      checkAsProduction('http://172.16.0.1/'),
      checkAsProduction('http://192.168.1.1/'),
    ]);
    for (const r of results) expect(r.safe).toBe(false);
  });

  it('blocks IPv6 loopback and unique-local addresses', async () => {
    const results = await Promise.all([
      checkAsProduction('http://[::1]/'),
      checkAsProduction('http://[fd00::1]/'),
    ]);
    for (const r of results) expect(r.safe).toBe(false);
  });

  it('blocks non-http(s) schemes', async () => {
    const res = await checkAsProduction('file:///etc/passwd');
    expect(res.safe).toBe(false);
  });

  it('blocks a hostname that resolves to a private address', async () => {
    // localtest.me and similar wildcard-DNS-to-127.0.0.1 services are a
    // realistic real-world SSRF vector precisely because the hostname
    // itself looks like a normal public domain.
    const res = await checkAsProduction('http://localtest.me/');
    expect(res.safe).toBe(false);
  }, 15000);

  it('rejects a malformed URL', async () => {
    const res = await checkAsProduction('not a url at all');
    expect(res.safe).toBe(false);
  });
});
