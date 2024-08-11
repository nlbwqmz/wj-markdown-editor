/* eslint-env node */
module.exports = {
  root: true,
  extends: [
    'standard'
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    // 构造器首字母不能时小写字母
    'new-cap': 'off'
  },
  ignorePatterns: ['/web-dist/**', '/electron-build/**']
}
