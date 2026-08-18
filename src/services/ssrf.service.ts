import * as dns from 'dns';
import * as net from 'net';

const lookup = dns.promises.lookup;

/**
 * SSRF guard for the DNA-scan endpoint (HANDOFF.md §22). Before this
 * existed, `POST /api/dna/scan` accepted any authenticated user's `url`
 * with only a syntactic `new URL(url)` check (dna.controller.ts) and
 * crawled it server-side via a real headless browser (crawl_agent.py) -
 * with the crawled content (title, markdown, DOM) returned straight back
 * to the requester. That's a textbook SSRF: any self-registered user could
 * submit `http://169.254.169.254/latest/meta-data/...` (cloud instance
 * metadata, including IAM credentials on AWS), or an internal service URL
 * reachable only from the server's own network (e.g. this app's own
 * Qdrant/Redis/Postgres if this ever runs in a shared network namespace),
 * and read the response back through the "scanned brand" UI. This was
 * confirmed as a real, reachable gap during this session's security
 * review - not a theoretical one.
 *
 * This checks the scheme and the *resolved* IP(s) for the hostname against
 * private/loopback/link-local/reserved ranges before allowing a scan.
 *
 * Known limitation, stated plainly rather than overclaimed: this is a
 * check-then-use gate, not an in-flight guarantee. A sophisticated
 * DNS-rebinding attack (a hostname that resolves to a public IP at check
 * time but a private one by the time crawl_agent.py's own browser actually
 * connects, seconds later) could still slip through - closing that
 * completely would mean pinning the resolved IP all the way through the
 * Python crawl subprocess, which crawl_agent.py doesn't currently support.
 * This still blocks the overwhelming majority of realistic SSRF attempts
 * (direct IP literals, common internal/metadata hostnames) and is a real
 * improvement over the previous "no check at all."
 */
export interface SsrfCheckResult {
  safe: boolean;
  reason?: string;
}

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformed - fail closed
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower === '::') return true; // unspecified
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10 link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique local
  // IPv4-mapped (::ffff:a.b.c.d) - check the embedded IPv4 too
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrReservedIPv4(mapped[1]);
  return false;
}

export async function checkUrlSafeToFetch(rawUrl: string): Promise<SsrfCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  // Test-only bypass - tests/dna.test.ts (and others) intentionally spin up
  // a real local HTTP server on 127.0.0.1/localhost for crawl_agent.py to
  // crawl offline, exactly the shape this guard exists to block in
  // production. Same test-mode-only escape hatch pattern already used by
  // quota.middleware.ts's forceScoreSequence gate and
  // rateLimit.middleware.ts's skip logic - never active outside
  // NODE_ENV=test, so it can't be used to bypass this in production no
  // matter what a caller sends.
  if (process.env.NODE_ENV === 'test') {
    return { safe: true };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'Only http/https URLs can be scanned' };
  }

  const hostname = parsed.hostname;

  // Reject IP-literal hosts outright if they're already private/reserved,
  // and localhost by name - the common, simplest attack shapes.
  if (/^localhost$/i.test(hostname) || hostname === '0.0.0.0') {
    return { safe: false, reason: 'Cannot scan a local/internal address' };
  }
  if (net.isIP(hostname)) {
    const bad = net.isIP(hostname) === 4 ? isPrivateOrReservedIPv4(hostname) : isPrivateOrReservedIPv6(hostname);
    if (bad) return { safe: false, reason: 'Cannot scan a private/internal IP address' };
    return { safe: true };
  }

  // Resolve the hostname and check every returned address - a domain can
  // have multiple A/AAAA records, and any one of them pointing internally
  // is enough to make this unsafe.
  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) {
      return { safe: false, reason: 'Could not resolve hostname' };
    }
    for (const { address, family } of addresses) {
      const bad = family === 4 ? isPrivateOrReservedIPv4(address) : isPrivateOrReservedIPv6(address);
      if (bad) return { safe: false, reason: 'Cannot scan a private/internal IP address' };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: 'Could not resolve hostname' };
  }
}
