import { resolveUserDataDir } from '../../util/userDataPathUtil.js'

export const configVersion = 1
export const configFileName = 'config.json'

// 目录统一由 userDataPathUtil 解析：
// 开发态写回应用目录，其余情况写 userData，可用 WJ_USER_DATA_DIR 覆盖。
export function resolveConfigDir({ app, env = process.env } = {}) {
  return resolveUserDataDir({ appApi: app, env })
}
