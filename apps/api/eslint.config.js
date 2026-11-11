const js = require('@eslint/js');

module.exports = [
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
];
