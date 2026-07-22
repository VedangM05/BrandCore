import { Request, Response, NextFunction } from 'express';
import { metricsRegistry } from '../services/metrics.service';
import { defaultQueueManager } from '../services/queue.service';

/**
 * Serves Prometheus formatted metrics text output.
 */
export function handlePrometheusMetrics(req: Request, res: Response) {
  const metricsText = metricsRegistry.getPrometheusMetrics();
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  return res.status(200).send(metricsText);
}

/**
 * Serves Grafana dashboard data summaries.
 */
export function handleGrafanaDashboardData(req: Request, res: Response) {
  const dashboardData = metricsRegistry.getGrafanaDashboardData();
  return res.status(200).json(dashboardData);
}

/**
 * Injects a deliberate failure into BullMQ queue processing for SLA testing.
 */
export async function handleInjectTestFailure(req: Request, res: Response, next: NextFunction) {
  try {
    const jobName = req.body?.jobName || 'deliberate_failure_job';
    const errorMessage = req.body?.errorMessage || 'Deliberate test fault injected into queue worker';

    // 1. Enqueue job
    const job = await defaultQueueManager.add(jobName, {
      shouldFail: true,
      errorMessage,
      injectedAt: new Date().toISOString()
    });

    // 2. Process job with handler that throws
    try {
      await defaultQueueManager.processJob(job.id, async (payload) => {
        if (payload.shouldFail) {
          throw new Error(payload.errorMessage);
        }
      });
    } catch (workerErr) {
      // Expected failure captured by worker
    }

    const updatedDashboard = metricsRegistry.getGrafanaDashboardData();

    return res.status(200).json({
      success: true,
      message: 'Deliberate failure injected into BullMQ queue processing',
      injectedJobId: job.id,
      timestamp: new Date().toISOString(),
      dashboardRefreshed: updatedDashboard
    });
  } catch (error) {
    next(error);
  }
}
