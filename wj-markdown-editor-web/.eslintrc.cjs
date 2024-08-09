/* eslint-env node */
module.exports = {
  root: true,
  extends: [
    'plugin:vue/vue3-strongly-recommended',
    'standard'
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    'vue/html-self-closing': 'off'
  },
  ignorePatterns: ['/public/**']
}
