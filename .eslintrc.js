// eslint-disable-next-line no-undef
module.exports = {
  env: {
    es2021: true,
    jest: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  rules: {
    'max-len': 0,
    'no-console': 2,
    quotes: [1, 'single'],
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
}
