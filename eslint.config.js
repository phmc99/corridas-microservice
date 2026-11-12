const js = require('@eslint/js');

module.exports = [
  { ignores: ['**/dist/'] },
  js.configs.recommended,
  {
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] },
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  // UI: módulos ES com JSX, rodando no navegador.
  {
    files: ['apps/ui/**/*.{js,jsx}'],
    languageOptions: {
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        atob: 'readonly',
        crypto: 'readonly',
        document: 'readonly',
        sessionStorage: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
];
