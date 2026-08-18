/**
 * Metrics & Observability Registry Service
 * Holds counters, gauges, and histograms for OpenTelemetry telemetry and Grafana monitoring.
 */

class MetricsRegistry {
  private agentNodeSpans = new Map<string, number>();
  private bullmqEvents = new Map<string, number>();
  private appErrors = new Map<string, number>();
  private jobDurations: number[] = [];

  /**
   * Records an OpenTelemetry span execution for a LangGraph agent node.
   */
  public recordAgentNodeSpan(nodeName: string, status: string = 'ok'): void {
    const key = `node="${nodeName}",status="${status}"`;
    const count = this.agentNodeSpans.get(key) || 0;
    this.agentNodeSpans.set(key, count + 1);
  }

  /**
   * Records a BullMQ queue job lifecycle event (completed, failed, stalled).
   */
  public recordBullMQEvent(queueName: string, event: 'completed' | 'failed' | 'stalled', durationMs?: number): void {
    const key = `queue="${queueName}",event="${event}"`;
    const count = this.bullmqEvents.get(key) || 0;
    this.bullmqEvents.set(key, count + 1);

    if (durationMs !== undefined) {
      this.jobDurations.push(durationMs);
    }
  }

  /**
   * Records application level error.
   */
  public recordAppError(component: string, errorCode: string): void {
    const key = `component="${component}",code="${errorCode}"`;
    const count = this.appErrors.get(key) || 0;
    this.appErrors.set(key, count + 1);
  }

  /**
   * Resets metrics state (used in testing).
   */
  public resetMetrics(): void {
    this.agentNodeSpans.clear();
    this.bullmqEvents.clear();
    this.appErrors.clear();
    this.jobDurations = [];
  }

  /**
   * Exports metrics formatted in Prometheus text format.
   */
  public getPrometheusMetrics(): string {
    const lines: string[] = [
      '# HELP brandcore_agent_node_spans_total Total OpenTelemetry spans recorded for LangGraph agent nodes',
      '# TYPE brandcore_agent_node_spans_total counter'
    ];

    for (const [labels, val] of this.agentNodeSpans.entries()) {
      lines.push(`brandcore_agent_node_spans_total{${labels}} ${val}`);
    }

    lines.push(
      '# HELP brandcore_bullmq_job_events_total Total BullMQ lifecycle events recorded (completed, failed, stalled)',
      '# TYPE brandcore_bullmq_job_events_total counter'
    );

    for (const [labels, val] of this.bullmqEvents.entries()) {
      lines.push(`brandcore_bullmq_job_events_total{${labels}} ${val}`);
    }

    lines.push(
      '# HELP brandcore_app_errors_total Total application errors recorded',
      '# TYPE brandcore_app_errors_total counter'
    );

    for (const [labels, val] of this.appErrors.entries()) {
      lines.push(`brandcore_app_errors_total{${labels}} ${val}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Exports summary metrics structure formatted for Grafana dashboards.
   */
  public getGrafanaDashboardData(): Record<string, any> {
    let completedJobs = 0;
    let failedJobs = 0;
    let stalledJobs = 0;

    for (const [key, val] of this.bullmqEvents.entries()) {
      if (key.includes('event="completed"')) completedJobs += val;
      if (key.includes('event="failed"')) failedJobs += val;
      if (key.includes('event="stalled"')) stalledJobs += val;
    }

    const totalJobs = completedJobs + failedJobs + stalledJobs;
    const failureRate = totalJobs > 0 ? (failedJobs / totalJobs) * 100 : 0;

    const agentSpans: Record<string, number> = {};
    for (const [key, val] of this.agentNodeSpans.entries()) {
      const match = key.match(/node="([^"]+)"/);
      if (match) {
        agentSpans[match[1]] = (agentSpans[match[1]] || 0) + val;
      }
    }

    return {
      status: 'active',
      timestamp: new Date().toISOString(),
      summary: {
        totalAgentSpansRecorded: Array.from(this.agentNodeSpans.values()).reduce((a, b) => a + b, 0),
        totalQueueJobsProcessed: totalJobs,
        completedJobs,
        failedJobs,
        stalledJobs,
        failureRatePercent: parseFloat(failureRate.toFixed(2))
      },
      agentNodesCoverage: agentSpans,
      queueHooksCoverage: {
        completedWired: true,
        failedWired: true,
        stalledWired: true
      }
    };
  }
}

export const metricsRegistry = new MetricsRegistry();

export function recordNodeSpan(nodeName: string, status: string = 'ok'): void {
  metricsRegistry.recordAgentNodeSpan(nodeName, status);
}
