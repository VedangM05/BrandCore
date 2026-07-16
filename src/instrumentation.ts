import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

// For local testing and development, we will use a ConsoleSpanExporter
// in combination with standard OpenTelemetry SDK.
const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  spanProcessors: [
    new SimpleSpanProcessor(new ConsoleSpanExporter())
  ],
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
