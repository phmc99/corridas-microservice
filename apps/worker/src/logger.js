function escrever(level, message, campos) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...campos }));
}

module.exports = {
  info: (message, campos) => escrever('info', message, campos),
  warn: (message, campos) => escrever('warn', message, campos),
  error: (message, campos) => escrever('error', message, campos),
};
