const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const serviceName = process.env.OTEL_SERVICE_NAME || 'rizzlerpies';
const exporterUrl =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  'http://signoz:4318/v1/traces';

process.env.OTEL_SERVICE_NAME = serviceName;

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: exporterUrl,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

Promise.resolve()
  .then(() => sdk.start())
  .then(() => {
    console.log('OpenTelemetry tracing initialized');
  })
  .catch((error) => {
    console.error('Error initializing OpenTelemetry', error);
  });

const shutdownTracing = async () => {
  try {
    await sdk.shutdown();
    console.log('OpenTelemetry tracing shut down');
  } catch (error) {
    console.error('Error shutting down OpenTelemetry', error);
  }
};

process.on('SIGINT', shutdownTracing);
process.on('SIGTERM', shutdownTracing);
