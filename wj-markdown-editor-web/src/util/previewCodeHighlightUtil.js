import hljs from 'highlight.js'

// 高亮结果缓存上限：超过后整体清空，避免无限增长
const HIGHLIGHT_RESULT_CACHE_LIMIT = 600
// 单帧时间预算与单帧处理数量上限，用于把大量代码块的高亮分摊到多帧
const HIGHLIGHT_FRAME_BUDGET_MS = 8
const HIGHLIGHT_MAX_ITEMS_PER_FRAME = 40
// 同步阶段最多额外计算（未命中缓存）的代码块数量：
// 缓存命中的项全部同步恢复（无计算成本），未命中项只同步前几个（通常就是正在编辑的代码块），
// 其余留给分帧，保证大文档首次渲染不会被同步高亮阻塞。
const SYNC_HIGHLIGHT_MAX_COMPUTED_ITEMS = 5

const highlightResultCache = new Map()

function buildHighlightCacheKey(language, code) {
  return `${language || 'auto'}\u0000${code}`
}

/**
 * 计算单个代码块的高亮结果（带缓存）。
 * language 为空时使用 highlight.js 的自动识别，并返回识别出的语言。
 *
 * @param {string} code 代码原文
 * @param {string} language highlight.js 的 canonical 语言 key；空字符串表示自动识别
 * @returns {{ html: string, detectedLanguage: string }} 高亮结果
 */
export function resolveCodeHighlightResult(code, language) {
  const cacheKey = buildHighlightCacheKey(language, code)
  const cachedResult = highlightResultCache.get(cacheKey)
  if (cachedResult) {
    return cachedResult
  }

  let result
  if (language) {
    result = {
      html: hljs.highlight(code, { language, ignoreIllegals: true }).value,
      detectedLanguage: '',
    }
  } else {
    const autoResult = hljs.highlightAuto(code)
    result = {
      html: autoResult.value,
      detectedLanguage: autoResult.language || '',
    }
  }

  if (highlightResultCache.size >= HIGHLIGHT_RESULT_CACHE_LIMIT) {
    highlightResultCache.clear()
  }
  highlightResultCache.set(cacheKey, result)
  return result
}

/**
 * 对单个待高亮代码节点执行高亮并清理标记。
 * 高亮失败时保留渲染阶段的转义文本，只移除标记，避免影响后续流程。
 *
 * @param {HTMLElement} codeElement 带 data-wj-hl-pending 标记的 code 节点
 */
export function applyCodeHighlightToElement(codeElement) {
  const code = codeElement.textContent ?? ''
  const language = codeElement.dataset?.wjHlLang || ''
  try {
    const result = resolveCodeHighlightResult(code, language)
    codeElement.innerHTML = result.html
    if (result.detectedLanguage) {
      codeElement.classList.add(`language-${result.detectedLanguage}`)
    }
  } catch (error) {
    console.error('[Preview] 代码块高亮失败，保留未高亮文本', error)
  } finally {
    delete codeElement.dataset?.wjHlPending
    delete codeElement.dataset?.wjHlLang
  }
}

/**
 * 分帧执行预览区代码块高亮，避免一次性同步高亮大量代码块阻塞主线程。
 * 代码块高亮只改变行内结构、不改变行数与行高，因此不会影响同步滚动的布局索引。
 *
 * @param {{
 *   previewRoot?: { querySelectorAll?: (selector: string) => Iterable<HTMLElement> } | null,
 *   isCurrentRefresh?: () => boolean,
 *   onSettled?: () => void,
 * }} options
 * @returns {{ cancel: () => void }} 控制器，可在下一轮刷新或组件卸载时取消
 */
export function schedulePreviewCodeHighlight(options = {}) {
  const {
    previewRoot,
    isCurrentRefresh,
    onSettled,
  } = options

  const pendingElements = Array.from(previewRoot?.querySelectorAll?.('code[data-wj-hl-pending]') || [])
  if (pendingElements.length === 0) {
    onSettled?.()
    return { cancel() {} }
  }

  let nextIndex = 0
  let rafId = null
  let cancelled = false

  const isStale = () => cancelled || (typeof isCurrentRefresh === 'function' && !isCurrentRefresh())

  // 同步优先：先在同一帧内恢复高亮，避免 updateDOM 拆掉旧高亮后出现“无色一帧”的闪烁。
  // 缓存命中的项全部同步恢复；未命中项只同步前几个（通常就是正在编辑的代码块），
  // 其余留给分帧处理。
  if (isStale() !== true) {
    let synchronousComputedCount = 0
    while (nextIndex < pendingElements.length) {
      const codeElement = pendingElements[nextIndex]
      if (!codeElement) {
        nextIndex += 1
        continue
      }

      const code = codeElement.textContent ?? ''
      const language = codeElement.dataset?.wjHlLang || ''
      const hasCachedResult = highlightResultCache.has(buildHighlightCacheKey(language, code))
      if (hasCachedResult !== true && synchronousComputedCount >= SYNC_HIGHLIGHT_MAX_COMPUTED_ITEMS) {
        break
      }
      if (hasCachedResult !== true) {
        synchronousComputedCount += 1
      }

      nextIndex += 1
      if (codeElement.isConnected) {
        applyCodeHighlightToElement(codeElement)
      }
    }
  }

  if (nextIndex >= pendingElements.length) {
    if (isStale() !== true) {
      onSettled?.()
    }
    return { cancel() {} }
  }

  const step = () => {
    rafId = null
    if (isStale()) {
      return
    }

    const frameStart = performance.now()
    let processedCount = 0
    while (
      nextIndex < pendingElements.length
      && processedCount < HIGHLIGHT_MAX_ITEMS_PER_FRAME
      && performance.now() - frameStart < HIGHLIGHT_FRAME_BUDGET_MS
    ) {
      const codeElement = pendingElements[nextIndex]
      nextIndex += 1
      processedCount += 1
      if (codeElement?.isConnected) {
        applyCodeHighlightToElement(codeElement)
      }
    }

    if (nextIndex < pendingElements.length) {
      rafId = requestAnimationFrame(step)
      return
    }

    if (!isStale()) {
      onSettled?.()
    }
  }

  rafId = requestAnimationFrame(step)

  return {
    cancel() {
      cancelled = true
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    },
  }
}

export default {
  resolveCodeHighlightResult,
  applyCodeHighlightToElement,
  schedulePreviewCodeHighlight,
}
