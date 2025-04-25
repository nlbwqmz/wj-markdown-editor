import antfu from '@antfu/eslint-config'

export default antfu({
  unocss: true,
  vue: true,
  formatters: {
    css: true,
    html: true,
    markdown: true,
  },
  rules: {
    'style/brace-style': 'off',
    'antfu/no-top-level-await': 'off',
  },
  ignores: ['public/**'],
})
