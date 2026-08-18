import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import IORedis from 'ioredis';
import { trace, propagation, context, SpanStatusCode } from '@opentelemetry/api';
import { metricsRegistry } from './metrics.service';

const tracer = trace.getTracer('brandcore-bullmq');

export interface BullMQJobData {
  id: string;
  name: string;
  payload: Record<string, any>;
  __traceContext?: Record<string, string>;
  createdAt: number;
}

export type JobHandler = (payload: any) => Promise<any>;

function createRedisConnection(): IORedis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  // BullMQ requires this - it manages retries itself and errors on the
  // default ioredis behavior of giving up after a fixed count.
  return new IORedis(url, { maxRetriesPerRequest: null });
}

/**
 * Thin wrapper around a real BullMQ Queue + Worker (spec: "BullMQ (with
 * concurrency caps)"). Previously this class was an in-memory EventEmitter
 * that only *looked* like BullMQ (same method names, same event names) -
 * nothing was ever persisted to Redis, no job survived a process restart,
 * and nothing here could run across more than one instance.
 *
 * Falls back to running jobs synchronously in-process, still going through
 * this same class's `add`/event-hook path, whenever REDIS_URL isn't
 * configured - every caller (the Knowledge Base indexing job, the
 * observability demo endpoint) works either way, just without real
 * durability/concurrency control in fallback mode. This mirrors the same
 * "degrade gracefully when optional infra isn't configured" pattern used
 * everywhere else in this codebase (Google auth, email delivery, Qdrant).
 *
 * BullMQ's real Worker model registers exactly one processor function per
 * queue at construction time - unlike the old fake API, individual jobs
 * can't each bring their own ad-hoc handler. `registerHandler(name, fn)`
 * lets different job *names* on the same queue still run different logic,
 * dispatched inside that one processor.
 */
export class ManagedQueue extends EventEmitter {
  private queueName: string;
  public readonly workerConcurrencyCap: number;
  public readonly defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  };

  private connection: IORedis | null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private queueEvents: QueueEvents | null = null;
  private handlers = new Map<string, JobHandler>();
  private eventHookCount = { completed: 0, failed: 0, stalled: 0 };

  constructor(queueName: string = 'creative-generation-queue', concurrencyCap: number = 5) {
    super();
    this.queueName = queueName;
    this.workerConcurrencyCap = concurrencyCap;
    this.connection = createRedisConnection();

    if (this.connection) {
      this.queue = new Queue(queueName, { connection: this.connection });
      this.queueEvents = new QueueEvents(queueName, { connection: this.connection });
    } else {
      console.log(`[Queue:${queueName}] REDIS_URL not configured - running in synchronous in-process fallback mode.`);
    }

    // Same three lifecycle hooks regardless of mode (real BullMQ events in
    // Redis mode, manually emitted in fallback mode - see runFallback).
    this.on('completed', (job: BullMQJobData) => {
      this.eventHookCount.completed++;
      metricsRegistry.recordBullMQEvent(this.queueName, 'completed', Date.now() - job.createdAt);
    });
    this.on('failed', (job: BullMQJobData, err?: Error) => {
      this.eventHookCount.failed++;
      metricsRegistry.recordBullMQEvent(this.queueName, 'failed', Date.now() - job.createdAt);
      metricsRegistry.recordAppError('queue_worker', err?.message || 'Job execution failed');
    });
    this.on('stalled', (_job: BullMQJobData) => {
      this.eventHookCount.stalled++;
      metricsRegistry.recordBullMQEvent(this.queueName, 'stalled');
    });
  }

  /**
   * Registers the handler for a given job name. Must be called before jobs
   * of that name are processed - in Redis mode this (re-)creates the
   * single Worker with a dispatcher over all registered handlers (BullMQ
   * only allows one processor per queue); in fallback mode it's just a
   * lookup table used synchronously inside `add`.
   */
  public registerHandler(jobName: string, handler: JobHandler): void {
    this.handlers.set(jobName, handler);

    if (!this.connection || !this.queue) return; // fallback mode - nothing to (re)wire

    if (this.worker) {
      this.worker.close();
    }
    this.worker = new Worker(
      this.queueName,
      async (job: Job) => {
        const fn = this.handlers.get(job.name);
        if (!fn) throw new Error(`No handler registered for job name "${job.name}" on queue "${this.queueName}"`);

        const traceCarrier = (job.data && job.data.__traceContext) || {};
        const parentContext = propagation.extract(context.active(), traceCarrier);
        return context.with(parentContext, () =>
          tracer.startActiveSpan(`bullmq_worker_${job.name}`, async (span) => {
            span.setAttribute('messaging.system', 'bullmq');
            span.setAttribute('messaging.destination', this.queueName);
            span.setAttribute('messaging.job_id', job.id || '');
            try {
              const result = await fn(job.data.payload);
              span.setStatus({ code: SpanStatusCode.OK });
              return result;
            } catch (err: any) {
              span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
              throw err;
            } finally {
              span.end();
            }
          })
        );
      },
      { connection: this.connection, concurrency: this.workerConcurrencyCap }
    );

    this.worker.on('completed', (job: Job) => {
      this.emit('completed', this.toJobData(job));
    });
    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      if (job) this.emit('failed', this.toJobData(job), err);
    });
    this.worker.on('stalled', (jobId: string) => {
      this.emit('stalled', { id: jobId, name: '', payload: {}, createdAt: Date.now() });
    });
  }

  private toJobData(job: Job): BullMQJobData {
    return {
      id: job.id || '',
      name: job.name,
      payload: job.data.payload,
      createdAt: job.timestamp,
    };
  }

  /**
   * Enqueues a job, injecting OpenTelemetry trace context into the job data
   * so the eventual worker execution (possibly in a different process, in
   * Redis mode) can be correlated back to the request that triggered it.
   */
  public async add(name: string, payload: Record<string, any>): Promise<BullMQJobData> {
    return tracer.startActiveSpan(`bullmq_enqueue_${name}`, async (span) => {
      const traceHeaderCarrier: Record<string, string> = {};
      propagation.inject(context.active(), traceHeaderCarrier);

      span.setAttribute('messaging.system', 'bullmq');
      span.setAttribute('messaging.destination', this.queueName);

      try {
        if (this.queue) {
          const job = await this.queue.add(
            name,
            { payload, __traceContext: traceHeaderCarrier },
            this.defaultJobOptions as any
          );
          span.setAttribute('messaging.job_id', job.id || '');
          span.setStatus({ code: SpanStatusCode.OK });
          return this.toJobData(job);
        }

        // Fallback mode: no Redis configured - run synchronously in-process.
        const jobData: BullMQJobData = {
          id: `fallback_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`,
          name,
          payload,
          __traceContext: traceHeaderCarrier,
          createdAt: Date.now(),
        };
        span.setAttribute('messaging.job_id', jobData.id);
        span.setStatus({ code: SpanStatusCode.OK });
        void this.runFallback(jobData);
        return jobData;
      } finally {
        span.end();
      }
    });
  }

  private async runFallback(job: BullMQJobData): Promise<void> {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      // No handler registered - nothing to run (matches BullMQ's own
      // behavior of a job just sitting unprocessed with no worker attached).
      return;
    }
    try {
      await handler(job.payload);
      this.emit('completed', job);
    } catch (err: any) {
      this.emit('failed', job, err);
    }
  }

  /**
   * Waits for a specific job id to reach completed/failed, via this class's
   * own `completed`/`failed` events - which fire in both Redis mode (via
   * the Worker listeners wired in registerHandler) and fallback mode (via
   * runFallback), so callers (tests, the observability demo endpoint) don't
   * need to know which mode is active.
   */
  public async waitForCompletion(
    jobId: string,
    timeoutMs: number = 15000
  ): Promise<{ status: 'completed' | 'failed'; error?: Error }> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.off('completed', onCompleted);
        this.off('failed', onFailed);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for job ${jobId} to complete`));
      }, timeoutMs);
      const onCompleted = (job: BullMQJobData) => {
        if (job.id === jobId) {
          cleanup();
          resolve({ status: 'completed' });
        }
      };
      const onFailed = (job: BullMQJobData, err?: Error) => {
        if (job.id === jobId) {
          cleanup();
          resolve({ status: 'failed', error: err });
        }
      };
      this.on('completed', onCompleted);
      this.on('failed', onFailed);
    });
  }

  public getHookCounts() {
    return { ...this.eventHookCount };
  }

  /** Clears state for tests. Safe in both Redis and fallback modes. */
  public async clear(): Promise<void> {
    this.eventHookCount = { completed: 0, failed: 0, stalled: 0 };
    if (this.queue) {
      await this.queue.obliterate({ force: true }).catch(() => {});
    }
  }

  public async close(): Promise<void> {
    await this.worker?.close();
    await this.queueEvents?.close();
    await this.queue?.close();
    await this.connection?.quit().catch(() => {});
  }
}

// Backward-compatible alias - existing imports/tests referencing
// `BullMQQueueManager` keep working.
export { ManagedQueue as BullMQQueueManager };

// In test mode, every Jest test FILE gets its own fresh module registry (so
// its own independent `defaultQueueManager` instance, its own real BullMQ
// Worker/connection) - but since app.ts pulls in observability.controller.ts,
// which registers a handler (and so creates a real Worker) at module load,
// virtually every backend test file ends up with a live Worker attached to
// the exact same Redis queue name, all still connected and still competing
// for jobs for the rest of the entire suite run (nothing ever closes them
// between files). A job enqueued by one file's instance can get silently
// claimed and processed by a completely different file's Worker - whose
// 'completed'/'failed' event fires on *that* file's own EventEmitter, never
// reaching the enqueuing file's `waitForCompletion` listener, which then
// times out despite the job having actually succeeded. Confirmed via a
// reproducible full-suite-only timeout (isolated and small-group reruns of
// the same test always passed).
//
// Scoping the queue name to a random per-process suffix in test mode gives
// each test file's own Redis queue namespace, eliminating the cross-file
// competition entirely while still exercising the real BullMQ/Redis path -
// production keeps the stable, shared name every real instance needs to
// actually share one queue.
const QUEUE_NAME = process.env.NODE_ENV === 'test' ? `brandcore-creative-queue-test-${crypto.randomUUID()}` : 'brandcore-creative-queue';

export const defaultQueueManager = new ManagedQueue(QUEUE_NAME);
