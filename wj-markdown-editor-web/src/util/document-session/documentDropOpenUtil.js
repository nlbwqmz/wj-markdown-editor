import channelUtil from '../channel/channelUtil.js'
import { requestDocumentOpenPathByInteraction } from './documentOpenInteractionService.js'

const MARKDOWN_FILE_NAME_PATTERN = /\.(?:md|markdown)$/iu

/**
 * 判断文件名是否为 Markdown 文档。
 *
 * @param {unknown} fileName 待判定的文件名。
 * @returns {boolean} 是否为 Markdown 文件名。
 */
export function isMarkdownFileName(fileName) {
  return typeof fileName === 'string' && MARKDOWN_FILE_NAME_PATTERN.test(fileName.trim())
}

/**
 * 从拖入的文件列表中挑选第一个 Markdown 文档。
 *
 * 多文件拖入时只接管第一个 Markdown 文件：
 * 统一打开交互同一时刻只保留一轮请求，并发提交多个目标会让前一轮请求被作废。
 *
 * @param {FileList | null | undefined} files 拖拽带来的文件列表。
 * @returns {File | null} 命中的 Markdown 文件；没有时返回 null。
 */
export function pickFirstMarkdownFile(files) {
  if (!files) {
    return null
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file && isMarkdownFileName(file.name)) {
      return file
    }
  }

  return null
}

/**
 * 尝试把拖入的 Markdown 文档按“打开文档”处理。
 *
 * 拖拽打开与文件管理栏、最近文件共用统一打开交互：
 * 已打开窗口聚焦、当前窗口切换、脏内容保存确认都由宿主编排决定。
 *
 * 返回 true 表示本次拖拽已被接管（含 Markdown 文件），
 * 调用方必须阻止默认行为，避免 Markdown 文件落入资源插入链路或触发页面导航。
 *
 * @param {FileList | null | undefined} files 拖拽带来的文件列表。
 * @returns {boolean} 是否接管本次拖拽。
 */
export function requestOpenDroppedMarkdownDocument(files) {
  const markdownFile = pickFirstMarkdownFile(files)
  if (!markdownFile) {
    return false
  }

  const filePath = channelUtil.getWebFilePath(markdownFile)
  if (filePath) {
    requestDocumentOpenPathByInteraction(filePath, {
      entrySource: 'drag-drop',
      trigger: 'user',
    }).catch(() => {})
  }

  return true
}

export default {
  isMarkdownFileName,
  pickFirstMarkdownFile,
  requestOpenDroppedMarkdownDocument,
}
