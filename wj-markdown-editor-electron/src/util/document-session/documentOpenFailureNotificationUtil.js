import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dialog, Notification } from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OPEN_FAILURE_NOTIFICATION_ICON_PATH = path.resolve(__dirname, '../../../icon/256x256.png')

function getLanguage(getConfig) {
  return getConfig?.()?.language || 'zh-CN'
}

function isWindowsLikePath(targetPath) {
  return /^[a-z]:[\\/]/i.test(targetPath) || targetPath.startsWith('\\\\')
}

function getPathFileName(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    return ''
  }

  if (isWindowsLikePath(targetPath)) {
    return path.win32.basename(targetPath.replaceAll('/', '\\'))
  }

  return path.posix.basename(targetPath.replaceAll('\\', '/'))
}

// 统一生成“打开 Markdown 文件失败”的系统提示文案。
// 这里不依赖 renderer i18n，避免在无窗口上下文时还要绕回前端文案链路。
export function getDocumentOpenFailureNotificationContent({
  documentPath,
  language = 'zh-CN',
}) {
  const fileName = getPathFileName(documentPath)

  if (language === 'en-US') {
    return {
      title: fileName ? `Failed to open Markdown file - ${fileName}` : 'Failed to open Markdown file',
      body: documentPath
        ? `Unable to read this Markdown file. Please check file permissions, file locks, or disk availability.\nPath: ${documentPath}`
        : 'Unable to read this Markdown file. Please check file permissions, file locks, or disk availability.',
    }
  }

  return {
    title: fileName ? `打开 Markdown 文件失败 - ${fileName}` : '打开 Markdown 文件失败',
    body: documentPath
      ? `无法读取该 Markdown 文件，请检查文件权限、占用状态或磁盘连接。\n路径：${documentPath}`
      : '无法读取该 Markdown 文件，请检查文件权限、占用状态或磁盘连接。',
  }
}

function focusTargetWindow(windowId, { resolveWindowById, listWindows }) {
  const targetWindow = windowId == null
    ? null
    : resolveWindowById?.(windowId)
  const windowList = listWindows?.()
  const fallbackWindow = Array.isArray(windowList)
    ? windowList[0] || null
    : null
  const focusWindow = targetWindow || fallbackWindow

  try {
    focusWindow?.show?.()
    focusWindow?.focus?.()
  } catch {
    // 聚焦窗口失败时不再继续抛错，避免影响系统通知本身。
  }
}

export function createDocumentOpenFailureNotificationPublisher({
  getConfig = () => ({}),
  notificationApi = Notification,
  createSystemNotification = options => new notificationApi(options),
  notificationIconPath = OPEN_FAILURE_NOTIFICATION_ICON_PATH,
  dialogApi = dialog,
  resolveWindowById = () => null,
  listWindows = () => [],
} = {}) {
  return ({
    windowId = null,
    path: documentPath = null,
  } = {}) => {
    const content = getDocumentOpenFailureNotificationContent({
      documentPath,
      language: getLanguage(getConfig),
    })

    try {
      if (notificationApi?.isSupported?.() === true) {
        const notification = createSystemNotification({
          ...content,
          icon: notificationIconPath,
        })
        notification?.on?.('click', () => {
          focusTargetWindow(windowId, {
            resolveWindowById,
            listWindows,
          })
        })
        notification?.show?.()
        return true
      }
    } catch {
      // 系统通知失败时继续走原生错误框兜底，避免启动打开或二开实例静默失败。
    }

    dialogApi?.showErrorBox?.(content.title, content.body)
    return false
  }
}

export default {
  createDocumentOpenFailureNotificationPublisher,
  getDocumentOpenFailureNotificationContent,
}
