import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('brandcore-domain-rate-limiter');

/**
 * Per-domain concurrency cap for crawl requests (spec Fix #6: "max 2
 * concurrent requests per host"). crawl_agent.py fetches exactly one page
 * per invocation (a single `crawler.arun(url=url)` call, not a multi-page
 * `arun_many` crawl), so there's no in-crawl concurrency to configure on the
 * Python side - the real risk is at the orchestration layer: nothing stopped
 * two overlapping scans of the same domain (two users scanning the same
 * site, or a user re-scanning while an earlier scan is still running) from
 * firing simultaneously. This queues excess requests for the same domain
 * rather than rejecting them outright, so the caller still gets a result -
 * just serialized behind the cap instead of hammering the target site.
 *
 * Deliberately keyed by domain, not globally - scans of different domains
 * are never queued behind each other.
 */
class DomainConcurrencyLimiter {
  private inFlight = new Map<string, number>();
  private queues = new Map<string, Array<() => void>>();

  constructor(private readonly maxConcurrentPerDomain: number) {}

  /** Current in-flight count for a domain, for tests/observability. */
  public getInFlightCount(domain: string): number {
    return this.inFlight.get(domain) || 0;
  }

  /** Current queued (waiting) count for a domain, for tests/observability. */
  public getQueuedCount(domain: string): number {
    return this.queues.get(domain)?.length || 0;
  }

  /**
   * Resolves once a concurrency slot for `domain` is available, returning a
   * release function the caller must call exactly once (typically in a
   * `finally` block) when done.
   */
  public async acquire(domain: string): Promise<() => void> {
    return tracer.startActiveSpan('domain_crawl_limiter_acquire', async (span) => {
      span.setAttribute('crawl.domain', domain);
      try {
        return await new Promise<() => void>((resolve) => {
          const tryAcquire = () => {
            const current = this.inFlight.get(domain) || 0;
            if (current < this.maxConcurrentPerDomain) {
              this.inFlight.set(domain, current + 1);
              span.setAttribute('crawl.queued', false);
              resolve(() => this.release(domain));
            } else {
              span.setAttribute('crawl.queued', true);
              const queue = this.queues.get(domain) || [];
              queue.push(tryAcquire);
              this.queues.set(domain, queue);
            }
          };
          tryAcquire();
        });
      } finally {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }
    });
  }

  private release(domain: string): void {
    const current = this.inFlight.get(domain) || 0;
    this.inFlight.set(domain, Math.max(0, current - 1));

    const queue = this.queues.get(domain);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      next();
    }
  }

  /** Test-only: resets all state between test cases. */
  public reset(): void {
    this.inFlight.clear();
    this.queues.clear();
  }
}

// Matches the spec doc's suggested default ("e.g. max 2 concurrent requests
// per host").
export const domainCrawlLimiter = new DomainConcurrencyLimiter(2);
export { DomainConcurrencyLimiter };
