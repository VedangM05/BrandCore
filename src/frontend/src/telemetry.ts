import { WebTracerProvider, SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { ZoneContextManager } from '@opentelemetry/context-zone';

let tracer: any = {
  startSpan: () => ({
    setAttribute: () => {},
    end: () => {}
  })
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    const provider = new WebTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())]
    });

    provider.register({
      contextManager: new ZoneContextManager()
    });

    registerInstrumentations({
      instrumentations: [new DocumentLoadInstrumentation()],
      tracerProvider: provider
    });

    tracer = provider.getTracer('brandcore-dashboard-web');
  } catch (e) {
    console.warn('Failed to initialize browser telemetry', e);
  }
}

export { tracer };

export function traceLayoutMount(componentName: string, startMs: number) {
  try {
    const span = tracer.startSpan(`mount_${componentName.toLowerCase()}`, {
      startTime: startMs
    });
    span.setAttribute('component.name', componentName);
    span.end();
  } catch (e) {
    // Graceful fallback if tracing is unavailable
  }
}
