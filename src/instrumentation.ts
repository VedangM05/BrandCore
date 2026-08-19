import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

// Dumping every span's full JSON to stdout is opt-in (OTEL_CONSOLE_EXPORT=true)
// - useful when actually debugging a trace, but otherwise drowns out the
// app's own logs (docker compose logs, etc.) with no real trace backend
// (Jaeger/Tempo/etc.) configured to make use of it anyway. Previously this
// registered the same ConsoleSpanExporter twice (once via `traceExporter`,
// once via a manually added SimpleSpanProcessor), so every span printed
// twice regardless of whether anyone wanted the noise at all.
const spanProcessors = process.env.OTEL_CONSOLE_EXPORT === 'true'
  ? [new SimpleSpanProcessor(new ConsoleSpanExporter())]
  : [];

const sdk = new NodeSDK({
  spanProcessors,
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PgInstrumentation({
      enhancedDatabaseReporting: true,
    }),
  ],
});

export function initializeTelemetry() {
  try {
    sdk.start();
    console.log('[Telemetry] OpenTelemetry initialized successfully.');
  } catch (error) {
    console.error('[Telemetry] Failed to initialize OpenTelemetry:', error);
  }
}

// Graceful shutdown on process exit
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('[Telemetry] Tracing terminated.'))
    .catch((error) => console.error('[Telemetry] Error terminating tracing:', error))
    .finally(() => process.exit(0));
});
