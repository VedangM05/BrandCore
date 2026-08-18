import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, closeDatabase, cleanDatabase, query } from '../src/db';
import { metricsRegistry } from '../src/services/metrics.service';
import { defaultQueueManager, BullMQQueueManager } from '../src/services/queue.service';
import { executeCreativePipeline } from '../src/services/creative.service';
import { getTestAuthSession } from './helpers/testAuth';

describe('Observability Module Integration & SLA Tests', () => {
  let brandDnaId: string;
  let authHeader: string;
  let testUserId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const session = await getTestAuthSession();
    authHeader = session.authHeader;
    testUserId = session.userId;
    metricsRegistry.resetMetrics();
    await defaultQueueManager.clear();

    const dnaRes = await query(
      `INSERT INTO crawl_results
      (domain, url, title, meta_description, markdown_content, logo_url, colors, font_pairings, tone, dom_hierarchy, tagline, mission, audience, value_proposition, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
      [
        'obsbrand.com',
        'http://obsbrand.com',
        'Observability Brand Co',
        'Full telemetry monitoring suite',
        '# Obs Brand',
        'http://obsbrand.com/logo.png',
        ['#6366f1', '#ec4899'],
        'Inter & Roboto',
        'Technical & Reliable',
        JSON.stringify([]),
        'Zero blind spots.',
        'To make system metrics crystal clear.',
        'Engineers and DevOps.',
        'Complete end-to-end tracing.',
        testUserId
      ]
    );
    brandDnaId = dnaRes.rows[0].id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // Target 1: Span coverage across agent pipeline (100% of LangGraph nodes emit a span)
  describe('Target 1: Agent Pipeline Span Coverage', () => {
    it('should verify 100% of LangGraph nodes emit an OpenTelemetry span during execution', async () => {
      // Force retries to exhaust bounded attempts and trigger Best-of-N fallback node
      const forceSequence = [50, 50, 50]; 
      await executeCreativePipeline(brandDnaId, 'Observability campaign test', forceSequence, undefined, testUserId);

      const dashboard = metricsRegistry.getGrafanaDashboardData();
      const nodesCoverage = dashboard.agentNodesCoverage;

      console.log('[TELEMETRY SPANS COVERAGE]', nodesCoverage);

      const requiredNodes = [
        'copywriter_agent_node',
        'art_director_agent_node',
        'qa_checker_node',
        'best_of_n_fallback_node'
      ];

      let coveredCount = 0;
      for (const nodeName of requiredNodes) {
        if (nodesCoverage[nodeName] && nodesCoverage[nodeName] > 0) {
          coveredCount++;
        }
      }

      const coveragePercent = (coveredCount / requiredNodes.length) * 100;
      console.log(`[SPAN COVERAGE METRIC] Coverage: ${coveragePercent.toFixed(1)}% (${coveredCount}/${requiredNodes.length} nodes)`);

      expect(coveragePercent).toBe(100.0);
    });
  });

  // Target 2: BullMQ event hook coverage (completed, failed, stalled states all wired and firing)
  describe('Target 2: BullMQ Event Hook Coverage', () => {
    it('should verify completed and failed lifecycle hooks fire accurately through real BullMQ', async () => {
      const testQueue = new BullMQQueueManager('test-hooks-queue');
      testQueue.registerHandler('job_success', async () => ({ status: 'done' }));
      testQueue.registerHandler('job_fail', async () => {
        throw new Error('Worker intentional crash');
      });

      // 1. Completed job - real BullMQ Worker picks this up and runs it.
      const job1 = await testQueue.add('job_success', { data: 'ok' });
      await testQueue.waitForCompletion(job1.id);

      // 2. Failed job.
      const job2 = await testQueue.add('job_fail', { data: 'error' });
      await testQueue.waitForCompletion(job2.id);

      // 3. Stalled - BullMQ's real stall detection is driven by its
      // internal lock-renewal timer (fires when a worker process dies or
      // its event loop is blocked past the lock duration), which isn't
      // something a fast, reliable unit test should try to trigger for
      // real. This exercises the class's own event-to-metrics wiring
      // directly instead - the part that actually matters for the
      // dashboard being correct, independent of what causes a real stall.
      testQueue.emit('stalled', { id: 'stall-test-job', name: 'job_stall', payload: {}, createdAt: Date.now() });

      const hookCounts = testQueue.getHookCounts();
      console.log('[BULLMQ EVENT HOOKS FIRED]', hookCounts);

      expect(hookCounts.completed).toBeGreaterThan(0);
      expect(hookCounts.failed).toBeGreaterThan(0);
      expect(hookCounts.stalled).toBeGreaterThan(0);

      const prometheusOutput = metricsRegistry.getPrometheusMetrics();
      expect(prometheusOutput).toContain('event="completed"');
      expect(prometheusOutput).toContain('event="failed"');
      expect(prometheusOutput).toContain('event="stalled"');

      await testQueue.close();
    }, 20000);
  });

  // Target 3: Dashboard reflects real failure (Inject deliberate failure, confirm in Grafana < 30s)
  describe('Target 3: Deliberate Failure Reflection SLA', () => {
    it('should reflect injected application failure in Grafana dashboard in under 30 seconds (< 30,000ms)', async () => {
      const startTime = Date.now();

      // Inject fault via HTTP API
      const injectRes = await request(app)
        .post('/api/observability/test-failure')
        .set('Authorization', authHeader)
        .send({ jobName: 'sla_failure_job', errorMessage: 'Injected fault for Grafana SLA test' });

      expect(injectRes.status).toBe(200);

      // Fetch Grafana dashboard data
      const dashRes = await request(app)
        .get('/api/observability/dashboard')
        .set('Authorization', authHeader);

      const reflectionLatency = Date.now() - startTime;
      console.log(`[DASHBOARD FAILURE METRIC] Failure Reflection Latency: ${reflectionLatency}ms`);

      expect(dashRes.status).toBe(200);
      expect(dashRes.body.summary.failedJobs).toBeGreaterThan(0);
      expect(dashRes.body.summary.failureRatePercent).toBeGreaterThan(0);
      expect(reflectionLatency).toBeLessThan(30000);
    });
  });

  // Prometheus Metrics Export format check
  describe('Prometheus Metrics Endpoint', () => {
    it('should export clean Prometheus text format on GET /metrics', async () => {
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('brandcore_agent_node_spans_total');
      expect(res.text).toContain('brandcore_bullmq_job_events_total');
      expect(res.text).toContain('brandcore_app_errors_total');
    });
  });
});
