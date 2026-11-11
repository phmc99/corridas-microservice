const app = require('./app');
const logger = require('./logger');

const porta = process.env.PORT ?? 3000;

const servidor = app.listen(porta, () => logger.info('api iniciada', { porta }));

process.on('SIGTERM', () => servidor.close(() => process.exit(0)));
