const { trace } = require('@opentelemetry/api');

function escrever(level, message, campos) {
  // trace_id do span ativo: liga o log ao trace no Jaeger. Fora de um span, fica de fora.
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, trace_id: traceId, ...campos }));
}

module.exports = {
  info: (message, campos) => escrever('info', message, campos),
  warn: (message, campos) => escrever('warn', message, campos),
  error: (message, campos) => escrever('error', message, campos),
};
