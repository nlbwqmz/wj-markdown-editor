import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Windows 下统一沿用历史 AUMID，既保证通知标题栏归属稳定，
// 也避免已发布版本的升级链路因为切换标识而产生额外风险。
export const WINDOWS_APP_USER_MODEL_ID = 'com.electron.wj-markdown-editor'

// 系统通知统一复用应用图标，避免不同通知各自维护路径。
export const APP_NOTIFICATION_ICON_PATH = path.resolve(__dirname, '../../icon/256x256.png')

export function applyWindowsAppIdentity({
  appApi,
  platform = process.platform,
} = {}) {
  if (platform !== 'win32') {
    return false
  }

  if (typeof appApi?.setAppUserModelId !== 'function') {
    return false
  }

  appApi.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID)
  return true
}

export default {
  APP_NOTIFICATION_ICON_PATH,
  WINDOWS_APP_USER_MODEL_ID,
  applyWindowsAppIdentity,
}
