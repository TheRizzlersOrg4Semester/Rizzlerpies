// tracing.js
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");

process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "rizzlerpies_app";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      "http://signoz-otel-collector:4318/v1/traces",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  sdk
    .shutdown()
    .finally(() => process.exit(0));
});
