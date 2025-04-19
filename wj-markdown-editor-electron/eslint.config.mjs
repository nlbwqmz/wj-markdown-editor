import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    'no-console': 'off',
    'node/prefer-global/process': 'off',
    'style/no-mixed-operators': 'off',
    'new-cap': 'off',
    'style/brace-style': 'off',
    'node/prefer-global/buffer': 'off',
  },
})
