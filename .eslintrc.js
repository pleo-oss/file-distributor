// eslint-disable-next-line no-undef
module.exports = {
  env: {
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  root: true,
  rules: {
    'import/extensions': 0,
    'import/no-unresolved': 0,
    'max-len': 0,
  },
  settings: {
    "import/resolver": {
      "typescript": {}
    }
  }
};
