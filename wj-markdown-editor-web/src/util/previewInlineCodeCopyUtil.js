/**
 * 判断当前选区是否为用户主动选择的一段文本。
 *
 * @param {{ isCollapsed?: boolean, toString?: () => string } | null | undefined} selection
 * @returns {boolean} 返回当前是否存在展开的文本选区。
 */
export function hasExpandedTextSelection(selection) {
  if (!selection || selection.isCollapsed !== false) {
    return false
  }

  return String(selection.toString?.() || '').length > 0
}

/**
 * 从预览点击事件目标中解析出可复制的行内代码节点。
 * 仅允许命中非链接、非代码块中的 `code/tt/samp`。
 *
 * @param {{ closest?: (selector: string) => any } | null | undefined} target
 * @returns {{ textContent?: string, closest?: (selector: string) => any } | null} 返回命中的行内代码节点；未命中时返回 null。
 */
export function resolvePreviewInlineCodeElement(target) {
  const inlineCodeElement = target?.closest?.('code, tt, samp') || null
  if (!inlineCodeElement) {
    return null
  }

  if (inlineCodeElement.closest?.('pre')) {
    return null
  }

  if (inlineCodeElement.closest?.('a[href]')) {
    return null
  }

  return inlineCodeElement
}

const PREVIEW_INLINE_CODE_COPYABLE_ATTRIBUTE = 'data-wj-inline-code-copyable'

/**
 * 同步预览区行内代码的可复制 metadata，供样式与交互共用同一套判定。
 *
 * @param {{
 *   enabled: boolean,
 *   previewRoot?: { querySelectorAll?: (selector: string) => Iterable<any> } | null,
 * }} params
 */
export function syncPreviewInlineCodeCopyMetadata(params) {
  const {
    enabled,
    previewRoot,
  } = params

  const inlineCodeElementList = previewRoot?.querySelectorAll?.('code, tt, samp') || []
  for (const inlineCodeElement of inlineCodeElementList) {
    const isCopyable = enabled && resolvePreviewInlineCodeElement(inlineCodeElement) === inlineCodeElement
    if (isCopyable) {
      inlineCodeElement.setAttribute(PREVIEW_INLINE_CODE_COPYABLE_ATTRIBUTE, 'true')
      continue
    }

    inlineCodeElement.removeAttribute(PREVIEW_INLINE_CODE_COPYABLE_ATTRIBUTE)
  }
}

/**
 * 根据开关状态、点击目标与选区状态，返回本次应复制的文本。
 *
 * @param {{
 *   enabled: boolean,
 *   selection?: { isCollapsed?: boolean, toString?: () => string } | null,
 *   target?: { closest?: (selector: string) => any } | null,
 * }} params
 * @returns {string | null} 返回应复制的文本；当前点击不应触发复制时返回 null。
 */
export function getPreviewInlineCodeCopyText(params) {
  const {
    enabled,
    selection,
    target,
  } = params

  if (!enabled || hasExpandedTextSelection(selection)) {
    return null
  }

  const inlineCodeElement = resolvePreviewInlineCodeElement(target)
  if (!inlineCodeElement) {
    return null
  }

  return inlineCodeElement.textContent || ''
}

/**
 * 统一执行复制并按结果回调消息提示。
 *
 * @param {{
 *   text: string,
 *   writeText: (text: string) => Promise<void> | void,
 *   onEmpty?: () => void,
 *   onSuccess?: () => void,
 *   onError?: () => void,
 * }} params
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'empty' | 'write-failed' }>} 返回复制执行结果。
 */
export async function copyTextWithFeedback(params) {
  const {
    text,
    writeText,
    onEmpty,
    onSuccess,
    onError,
  } = params

  if (!text) {
    onEmpty?.()
    return {
      ok: false,
      reason: 'empty',
    }
  }

  try {
    await writeText(text)
    onSuccess?.()
    return {
      ok: true,
    }
  } catch {
    onError?.()
    return {
      ok: false,
      reason: 'write-failed',
    }
  }
}
