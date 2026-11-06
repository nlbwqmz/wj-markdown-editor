/**
 * 前端资源来源解析。
 *
 * 与 `NODE_ENV` 解耦：`NODE_ENV=dev` 曾经同时表示“加载 dev server”和“数据目录写到应用目录”，
 * 导致 `npm run static`（要加载 web-dist）无法复用。现在来源由 `WJ_WEB_SOURCE` 单独表达：
 * - `dev`：加载 http://localhost:8080（需先启动 web 端的 `npm run dev`）
 * - 其它/未设置：加载已构建的 web-dist
 */
export const WEB_SOURCE_ENV = 'WJ_WEB_SOURCE'
export const WEB_SOURCE_DEV = 'dev'
export const WEB_SOURCE_DIST = 'dist'

export function resolveWebSource({ env = process.env } = {}) {
  const rawValue = env[WEB_SOURCE_ENV]
  if (typeof rawValue === 'string' && rawValue.trim().toLowerCase() === WEB_SOURCE_DEV) {
    return WEB_SOURCE_DEV
  }

  return WEB_SOURCE_DIST
}

export function isDevServerMode(options) {
  return resolveWebSource(options) === WEB_SOURCE_DEV
}
