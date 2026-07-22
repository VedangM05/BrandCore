import { EventEmitter } from 'events';
import { trace, propagation, context, SpanStatusCode } from '@opentelemetry/api';
import { metricsRegistry } from './metrics.service';

const tracer = trace.getTracer('brandcore-bullmq-tracer');

export interface BullMQJobData {
  id: string;
  name: string;
  payload: Record<string, any>;
  __traceContext?: Record<string, string>;
  createdAt: number;
}

export type QueueEventHandler = (job: BullMQJobData, err?: Error) => void;

export class BullMQQueueManager extends EventEmitter {
  private queueName: string;
  private jobs: Map<string, BullMQJobData> = new Map();
  private eventHookCount = {
    completed: 0,
    failed: 0,
    stalled: 0
  };

  constructor(queueName: string = 'creative-generation-queue') {
    super();
    this.queueName = queueName;

    // Attach direct BullMQ lifecycle event listeners
    this.on('completed', (job: BullMQJobData) => {
      this.eventHookCount.completed++;
      metricsRegistry.recordBullMQEvent(this.queueName, 'completed', Date.now() - job.createdAt);
    });

    this.on('failed', (job: BullMQJobData, err?: Error) => {
      this.eventHookCount.failed++;
      metricsRegistry.recordBullMQEvent(this.queueName, 'failed', Date.now() - job.createdAt);
      metricsRegistry.recordAppError('queue_worker', err?.message || 'Job execution failed');
    });

    this.on('stalled', (job: BullMQJobData) => {
      this.eventHookCount.stalled++;
      metricsRegistry.recordBullMQEvent(this.queueName, 'stalled');
    });
  }

  /**
   * Enqueues a job while injecting OpenTelemetry trace context into the job data payload.
   */
  public async add(name: string, payload: Record<string, any>): Promise<BullMQJobData> {
    return tracer.startActiveSpan(`bullmq_enqueue_${name}`, async (span) => {
      const traceHeaderCarrier: Record<string, string> = {};
      
      // Inject active trace context into headers carrier
      propagation.inject(context.active(), traceHeaderCarrier);

      const job: BullMQJobData = {
        id: `job_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`,
        name,
        payload,
        __traceContext: traceHeaderCarrier,
        createdAt: Date.now()
      };

      this.jobs.set(job.id, job);

      span.setAttribute('messaging.system', 'bullmq');
      span.setAttribute('messaging.destination', this.queueName);
      span.setAttribute('messaging.job_id', job.id);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return job;
    });
  }

  /**
   * Worker step processing an enqueued job. Extracts trace context and fires lifecycle events.
   */
  public async processJob(jobId: string, handler: (payload: any) => Promise<any>): Promise<any> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found with ID: ${jobId}`);
    }

    // Extract OpenTelemetry trace context from job payload carrier
    const parentContext = propagation.extract(context.active(), job.__traceContext || {});

    return context.with(parentContext, async () => {
      return tracer.startActiveSpan(`bullmq_worker_${job.name}`, async (span) => {
        span.setAttribute('messaging.system', 'bullmq');
        span.setAttribute('messaging.destination', this.queueName);
        span.setAttribute('messaging.job_id', job.id);

        try {
          // Check for simulated stalled trigger condition
          if (job.payload?.simulateStall) {
            this.emit('stalled', job);
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'Worker job stalled' });
            span.end();
            return { status: 'stalled' };
          }

          const result = await handler(job.payload);

          span.setStatus({ code: SpanStatusCode.OK });
          span.end();

          this.emit('completed', job);
          return result;
        } catch (error: any) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          span.end();

          this.emit('failed', job, error);
          throw error;
        }
      });
    });
  }

  /**
   * Retrieves summary count of fired event hooks.
   */
  public getHookCounts() {
    return { ...this.eventHookCount };
  }

  /**
   * Clears state for tests.
   */
  public clear(): void {
    this.jobs.clear();
    this.eventHookCount = { completed: 0, failed: 0, stalled: 0 };
  }
}

export const defaultQueueManager = new BullMQQueueManager('brandcore-creative-queue');
