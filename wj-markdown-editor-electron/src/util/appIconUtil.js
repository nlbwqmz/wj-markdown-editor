import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ICON_DIR = path.resolve(__dirname, '../../icon')

/**
 * 解析窗口图标路径。
 *
 * Windows 使用多尺寸 ICO：任务栏 / Alt+Tab 由系统按 SM_CXICON / SM_CXSMICON 取帧，
 * 单帧图标只能靠缩放，小尺寸会发虚。
 * 其它平台使用 PNG：Electron 只承诺 PNG / JPEG，且 Linux 的 Dock 图标主要来自 .desktop。
 *
 * @param {NodeJS.Platform} platform 目标平台
 * @returns {string} 窗口图标绝对路径
 */
export function resolveWindowIconPath(platform = process.platform) {
  return platform === 'win32'
    ? path.join(ICON_DIR, 'favicon.ico')
    : path.join(ICON_DIR, '256x256.png')
}

export const WINDOW_ICON_PATH = resolveWindowIconPath()

export default {
  WINDOW_ICON_PATH,
  resolveWindowIconPath,
}
