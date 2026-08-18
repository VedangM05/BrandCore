import { DomainConcurrencyLimiter } from '../src/services/domainRateLimiter.service';

describe('DomainConcurrencyLimiter', () => {
  it('allows up to the configured cap to run concurrently for the same domain', async () => {
    const limiter = new DomainConcurrencyLimiter(2);

    const release1 = await limiter.acquire('example.com');
    const release2 = await limiter.acquire('example.com');

    expect(limiter.getInFlightCount('example.com')).toBe(2);

    release1();
    release2();
    expect(limiter.getInFlightCount('example.com')).toBe(0);
  });

  it('queues a request past the cap instead of running it immediately', async () => {
    const limiter = new DomainConcurrencyLimiter(1);

    const release1 = await limiter.acquire('example.com');

    let secondAcquired = false;
    const secondPromise = limiter.acquire('example.com').then((release) => {
      secondAcquired = true;
      return release;
    });

    // Give the microtask queue a tick - the second acquire must still be
    // pending because the cap (1) is already held by the first caller.
    await new Promise((r) => setTimeout(r, 20));
    expect(secondAcquired).toBe(false);
    expect(limiter.getQueuedCount('example.com')).toBe(1);

    release1();
    const release2 = await secondPromise;
    expect(secondAcquired).toBe(true);
    expect(limiter.getInFlightCount('example.com')).toBe(1);

    release2();
  });

  it('never lets in-flight count exceed the cap even under a burst of concurrent acquires', async () => {
    const limiter = new DomainConcurrencyLimiter(2);
    const releases: Array<() => void> = [];

    // Fire 3 concurrent acquires against a cap of 2 - the 3rd deliberately
    // stays pending (nothing has released yet), so it's tracked separately
    // rather than awaited alongside the first two.
    const p1 = limiter.acquire('burst.com').then((r) => releases.push(r));
    const p2 = limiter.acquire('burst.com').then((r) => releases.push(r));
    let thirdAcquired = false;
    const p3 = limiter.acquire('burst.com').then((r) => {
      thirdAcquired = true;
      releases.push(r);
    });

    await Promise.all([p1, p2]);
    expect(limiter.getInFlightCount('burst.com')).toBe(2);
    expect(limiter.getQueuedCount('burst.com')).toBe(1);
    expect(thirdAcquired).toBe(false);

    // Releasing one slot lets the queued 3rd through, still never exceeding the cap.
    releases.shift()!();
    await p3;
    expect(thirdAcquired).toBe(true);
    expect(limiter.getInFlightCount('burst.com')).toBe(2);

    releases.forEach((r) => r());
    expect(limiter.getInFlightCount('burst.com')).toBe(0);
  });

  it('scopes concurrency independently per domain - one domain filling up never blocks another', async () => {
    const limiter = new DomainConcurrencyLimiter(1);

    const releaseA1 = await limiter.acquire('a.com');
    // b.com has its own independent slot - must not be queued behind a.com.
    const releaseB1 = await limiter.acquire('b.com');

    expect(limiter.getInFlightCount('a.com')).toBe(1);
    expect(limiter.getInFlightCount('b.com')).toBe(1);
    expect(limiter.getQueuedCount('a.com')).toBe(0);
    expect(limiter.getQueuedCount('b.com')).toBe(0);

    releaseA1();
    releaseB1();
  });

  it('release is safe to call and does not go negative on an empty domain', () => {
    const limiter = new DomainConcurrencyLimiter(2);
    expect(limiter.getInFlightCount('never-touched.com')).toBe(0);
  });
});
