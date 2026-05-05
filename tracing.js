const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const serviceName = process.env.OTEL_SERVICE_NAME || 'rizzlerpies';
const exporterUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://signoz:4318/v1/traces';

const traceExporter = new OTLPTraceExporter({
  url: exporterUrl,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
  }),
  traceExporter,
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
