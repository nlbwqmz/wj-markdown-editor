import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyCodeHighlightToElement,
  resolveCodeHighlightResult,
  schedulePreviewCodeHighlight,
} from '../previewCodeHighlightUtil.js'

function createPendingCodeElement({ code, language }) {
  const codeElement = document.createElement('code')
  codeElement.className = 'hljs'
  codeElement.setAttribute('data-wj-hl-pending', '1')
  if (language) {
    codeElement.setAttribute('data-wj-hl-lang', language)
  }
  codeElement.textContent = code
  return codeElement
}

describe('previewCodeHighlightUtil', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', callback => setTimeout(() => callback(performance.now()), 0))
    vi.stubGlobal('cancelAnimationFrame', id => clearTimeout(id))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('显式语言的高亮结果包含高亮标记，且重复调用命中缓存', () => {
    const first = resolveCodeHighlightResult('const value = 1', 'javascript')
    expect(first.html).toContain('hljs-')
    expect(first.detectedLanguage).toBe('')

    const second = resolveCodeHighlightResult('const value = 1', 'javascript')
    expect(second).toBe(first)
  })

  it('未指定语言时返回自动识别出的语言', () => {
    const result = resolveCodeHighlightResult('{\n  "name": "test",\n  "value": 1\n}', '')
    expect(result.detectedLanguage).toBeTruthy()
    expect(result.html).toContain('hljs-')
  })

  it('applyCodeHighlightToElement 写入高亮结果并清理标记', () => {
    const codeElement = createPendingCodeElement({ code: 'const value = 1', language: 'javascript' })
    applyCodeHighlightToElement(codeElement)

    expect(codeElement.innerHTML).toContain('hljs-')
    expect(codeElement.hasAttribute('data-wj-hl-pending')).toBe(false)
    expect(codeElement.hasAttribute('data-wj-hl-lang')).toBe(false)
  })

  it('高亮失败时保留原文并清理标记', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const codeElement = createPendingCodeElement({ code: '<div>& unsafe', language: 'wj-not-exists-language' })

    applyCodeHighlightToElement(codeElement)

    expect(codeElement.textContent).toBe('<div>& unsafe')
    expect(codeElement.hasAttribute('data-wj-hl-pending')).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('schedulePreviewCodeHighlight 分帧处理全部待高亮代码块并回调 onSettled', async () => {
    const root = document.createElement('div')
    const first = createPendingCodeElement({ code: 'const value = 1', language: 'javascript' })
    const second = createPendingCodeElement({ code: 'print(1)', language: 'python' })
    root.append(first, second)
    document.body.append(root)

    const onSettled = vi.fn()
    schedulePreviewCodeHighlight({ previewRoot: root, onSettled })

    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1))
    expect(first.innerHTML).toContain('hljs-')
    expect(second.innerHTML).toContain('hljs-')
    expect(root.querySelectorAll('code[data-wj-hl-pending]').length).toBe(0)

    root.remove()
  })

  it('schedulePreviewCodeHighlight 在刷新序号失效时中止处理', async () => {
    const root = document.createElement('div')
    const first = createPendingCodeElement({ code: 'const value = 1', language: 'javascript' })
    root.append(first)
    document.body.append(root)

    const onSettled = vi.fn()
    schedulePreviewCodeHighlight({
      previewRoot: root,
      isCurrentRefresh: () => false,
      onSettled,
    })

    await new Promise(resolve => setTimeout(resolve, 20))
    expect(onSettled).not.toHaveBeenCalled()
    expect(first.hasAttribute('data-wj-hl-pending')).toBe(true)

    root.remove()
  })

  it('缓存命中的代码块在调度时同步恢复高亮（避免编辑时闪烁）', () => {
    // 预热缓存，模拟“代码块内容未变化”的编辑刷新场景
    resolveCodeHighlightResult('const cached_value = 1', 'javascript')

    const root = document.createElement('div')
    const first = createPendingCodeElement({ code: 'const cached_value = 1', language: 'javascript' })
    root.append(first)
    document.body.append(root)

    const onSettled = vi.fn()
    schedulePreviewCodeHighlight({ previewRoot: root, onSettled })

    // 同步阶段应立即恢复高亮，无需等待 rAF
    expect(first.hasAttribute('data-wj-hl-pending')).toBe(false)
    expect(first.innerHTML).toContain('hljs-')
    expect(onSettled).toHaveBeenCalledTimes(1)

    root.remove()
  })

  it('未命中缓存的代码块只同步处理前几个，其余留给分帧', async () => {
    const root = document.createElement('div')
    const elements = []
    for (let index = 0; index < 8; index++) {
      const element = createPendingCodeElement({
        code: `const uncached_${index} = ${index}`,
        language: 'javascript',
      })
      elements.push(element)
      root.append(element)
    }
    document.body.append(root)

    const onSettled = vi.fn()
    schedulePreviewCodeHighlight({ previewRoot: root, onSettled })

    // 同步阶段只处理前 5 个未命中项，剩余留给分帧
    const synchronouslyProcessedCount = elements
      .filter(element => !element.hasAttribute('data-wj-hl-pending'))
      .length
    expect(synchronouslyProcessedCount).toBe(5)
    expect(onSettled).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1))
    expect(root.querySelectorAll('code[data-wj-hl-pending]').length).toBe(0)

    root.remove()
  })

  it('没有待高亮代码块时立即回调 onSettled', () => {
    const root = document.createElement('div')
    const onSettled = vi.fn()
    schedulePreviewCodeHighlight({ previewRoot: root, onSettled })
    expect(onSettled).toHaveBeenCalledTimes(1)
  })
})
