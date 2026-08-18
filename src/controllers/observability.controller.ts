import { Request, Response, NextFunction } from 'express';
import { metricsRegistry } from '../services/metrics.service';
import { defaultQueueManager } from '../services/queue.service';

// Registered once at module load - real BullMQ (unlike the old fake queue)
// requires a fixed processor per job name, not a handler swapped in per
// call. Dispatch on payload.shouldFail so this same handler backs both the
// "deliberate failure" demo below and any ordinary job of this name.
defaultQueueManager.registerHandler('deliberate_failure_job', async (payload) => {
  if (payload.shouldFail) {
    throw new Error(payload.errorMessage);
  }
  return { status: 'ok' };
});

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

    // Custom job names (beyond the default registered at module load) need
    // their own handler - real BullMQ's Worker dispatches strictly by name.
    if (jobName !== 'deliberate_failure_job') {
      defaultQueueManager.registerHandler(jobName, async (payload) => {
        if (payload.shouldFail) throw new Error(payload.errorMessage);
        return { status: 'ok' };
      });
    }

    const job = await defaultQueueManager.add(jobName, {
      shouldFail: true,
      errorMessage,
      injectedAt: new Date().toISOString()
    });

    // Wait for the worker (real BullMQ, or the synchronous fallback when
    // REDIS_URL isn't configured) to actually run and fail the job, so the
    // dashboard snapshot below reflects it.
    await defaultQueueManager.waitForCompletion(job.id).catch(() => {
      // Timed out - proceed anyway; the dashboard just won't show it yet.
    });

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
