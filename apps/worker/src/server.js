const app = require('./app');
const { iniciarConsumo } = require('./consumidores/eventos-corrida');
const historico = require('./historico/eventos');
const logger = require('./logger');

const porta = process.env.PORT ?? 3001;

async function iniciar() {
  await historico.conectar();
  const pararConsumo = await iniciarConsumo();
  const servidor = app.listen(porta, () => logger.info('worker iniciado', { porta }));

  process.on('SIGTERM', async () => {
    servidor.close();
    await pararConsumo();
    await historico.cliente.close();
    process.exit(0);
  });
}

iniciar().catch((erro) => {
  logger.error('falha ao iniciar o worker', { erro: erro.message });
  process.exit(1);
});
