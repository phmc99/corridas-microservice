// Carregado antes do resto da aplicação (node --require), para as instrumentações
// conseguirem envolver http, express, ioredis e Prisma quando eles forem importados.
// Sem OTEL_EXPORTER_OTLP_ENDPOINT (ex.: nos testes) não liga o tracing.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
  const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
  const { PrismaInstrumentation } = require('@prisma/instrumentation');

  const sdk = new NodeSDK({
    serviceName: 'corridas-api',
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      // O /metrics é chamado pelo Prometheus a cada 15 s e só geraria ruído.
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => req.url === '/metrics' }),
      new ExpressInstrumentation(),
      new IORedisInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });
  sdk.start();
}
