// Carregado antes do resto da aplicação (node --require), para as instrumentações
// conseguirem envolver ioredis e mongodb quando eles forem importados.
// Sem OTEL_EXPORTER_OTLP_ENDPOINT (ex.: nos testes) não liga o tracing.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
  const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');

  const sdk = new NodeSDK({
    serviceName: 'corridas-worker',
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [new IORedisInstrumentation(), new MongoDBInstrumentation()],
  });
  sdk.start();
}
