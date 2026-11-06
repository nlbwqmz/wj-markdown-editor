import path from 'node:path'
import { app } from 'electron'
import { USER_DATA_DIR_ENV, USER_DATA_IN_APP_DIR_ENV, USER_DATA_SUBDIR } from './userDataPathConstants.js'

export { USER_DATA_DIR_ENV, USER_DATA_IN_APP_DIR_ENV, USER_DATA_SUBDIR }

/**
 * 用户数据目录的唯一解析入口。
 *
 * 基础目录优先级：
 * 1. `WJ_USER_DATA_DIR`：显式覆盖，发行版打包（例如 AUR）只需在启动脚本里设置环境变量，
 *    不必再解包 asar 改代码
 * 2. `WJ_USER_DATA_IN_APP_DIR=1`：显式声明数据目录写到应用目录（`npm run start` / `npm run static` 都用它）
 * 3. 其余情况一律 `app.getPath('userData')`
 *
 * 这里刻意不看 `NODE_ENV`：前端走 dev server 还是 web-dist 由 webSourceUtil 的 `WJ_WEB_SOURCE` 决定，
 * 两件事互不影响。
 *
 * 三种基础目录下都再套一层 `data/`：配置、最近文件、标签组、日志、迁移标记都收在这一层，
 * 不跟 Chromium 的 Cache / Local Storage / Preferences 混在一起。
 *
 * 这里刻意不用 `app.isPackaged`：发行版用系统 electron 加载已安装目录时，
 * `isPackaged` 同样为 false，会把用户数据写进只读安装目录。
 */
function isEnabledFlag(value) {
  if (typeof value !== 'string') {
    return false
  }

  const normalizedValue = value.trim().toLowerCase()
  return normalizedValue !== '' && normalizedValue !== '0' && normalizedValue !== 'false'
}

function resolveBaseDir({ appApi, env }) {
  const overrideDir = env[USER_DATA_DIR_ENV]
  if (typeof overrideDir === 'string' && overrideDir.trim() !== '') {
    return path.resolve(overrideDir.trim())
  }

  if (isEnabledFlag(env[USER_DATA_IN_APP_DIR_ENV])) {
    return path.resolve(appApi.getAppPath())
  }

  return path.resolve(appApi.getPath('userData'))
}

export function resolveUserDataDir({ appApi = app, env = process.env } = {}) {
  return path.join(resolveBaseDir({ appApi, env }), USER_DATA_SUBDIR)
}
