import md from '@/util/markdown-it/markdownItDefault.js'

/**
 * 大纲解析：直接从 Markdown 源文本解析标题结构，不依赖预览区 DOM。
 *
 * 与 MarkdownPreview 的 DOM 扫描方案相比：
 * - 源码编辑模式（无预览列）下同样可用；
 * - 不依赖具体预览组件实例，避免 keep-alive 双实例互相覆盖。
 *
 * 标题 id 由 markdown-it-anchor 在 core 阶段写入 token，和预览渲染同源，因此 href 可直接用于预览锚点跳转。
 */

// 与预览区大纲保持一致的受控行内标签白名单
const OUTLINE_INLINE_TAG_NAME_SET = new Set([
  'b',
  'code',
  'del',
  'em',
  'i',
  'ins',
  'mark',
  's',
  'strong',
  'sub',
  'sup',
  'u',
])

const OUTLINE_TEXT_COLOR_SPAN_CLASS_NAME_SET = new Set([
  'markdown-it-text-color',
  'markdown-it-text-color-gradient',
])

/**
 * 将文本节点转成可安全注入 v-html 的 HTML 片段。
 *
 * @param {string} value - 原始文本内容
 * @returns {string} 经过 HTML 转义后的文本
 */
function escapeOutlineHeadingHtmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * 将属性值转义为安全的 HTML attribute 文本。
 *
 * @param {string} value - 原始属性值
 * @returns {string} 转义后的属性值
 */
function escapeOutlineHeadingHtmlAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * 递归提取标题中的受控行内富文本，仅保留允许进入大纲的语义标签，
 * 以及项目内置文字颜色扩展生成的白名单 span。
 *
 * @param {Node} node - 当前待处理节点
 * @returns {string} 清洗后的 HTML 片段
 */
function buildOutlineHeadingHtmlFromNode(node) {
  if (!(node instanceof Node)) {
    return ''
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return escapeOutlineHeadingHtmlText(node.textContent)
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const element = /** @type {HTMLElement} */ (node)
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'img') {
    return escapeOutlineHeadingHtmlText(element.getAttribute('alt') || '')
  }
  if (tagName === 'br') {
    return ' '
  }

  const childHtml = Array.from(element.childNodes)
    .map(childNode => buildOutlineHeadingHtmlFromNode(childNode))
    .join('')

  if (tagName === 'span') {
    const className = Array.from(element.classList)
      .find(candidateClassName => OUTLINE_TEXT_COLOR_SPAN_CLASS_NAME_SET.has(candidateClassName))
    const textColorValue = element.style.getPropertyValue('--markdown-it-text-color').trim()

    if (className && textColorValue) {
      const escapedClassName = escapeOutlineHeadingHtmlAttribute(className)
      const escapedTextColorValue = escapeOutlineHeadingHtmlAttribute(textColorValue)
      return `<span class="${escapedClassName}" style="--markdown-it-text-color: ${escapedTextColorValue}">${childHtml}</span>`
    }
  }

  if (OUTLINE_INLINE_TAG_NAME_SET.has(tagName)) {
    return `<${tagName}>${childHtml}</${tagName}>`
  }

  return childHtml
}

/**
 * 将标题的行内 HTML 转成大纲展示用的纯文本与受控富文本。
 *
 * @param {string} inlineHtml - 标题行内渲染结果
 * @returns {{ title: string, titleHtml: string }} 纯文本标题与清洗后的标题 HTML
 */
function buildOutlineHeadingContent(inlineHtml) {
  const container = document.createElement('div')
  container.innerHTML = inlineHtml

  return {
    title: container.textContent ?? '',
    titleHtml: Array.from(container.childNodes)
      .map(node => buildOutlineHeadingHtmlFromNode(node))
      .join(''),
  }
}

/**
 * 解析行号属性为可用的正整数。
 *
 * @param {string | null | undefined} value - data-line-start / data-line-end 原始值
 * @returns {number | undefined} 解析成功返回正整数，否则 undefined
 */
function parseHeadingLineNumber(value) {
  const numericValue = Number.parseInt(value || '', 10)
  if (Number.isInteger(numericValue) !== true || numericValue <= 0) {
    return undefined
  }

  return numericValue
}

/**
 * 从 Markdown 源文本解析大纲树。
 *
 * @param {string} content - 当前文档的 Markdown 源文本
 * @returns {Array<object>} 与预览区 anchorList 结构一致的大纲树
 */
export function parseOutlineFromMarkdown(content) {
  const source = typeof content === 'string' ? content : ''
  if (source.trim() === '') {
    return []
  }

  const env = {}
  const tokens = md.parse(source, env)
  const tree = []
  const stack = [{ children: tree }]

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.type !== 'heading_open') {
      continue
    }

    const inlineToken = tokens[index + 1]
    const id = token.attrGet('id') ?? ''
    const inlineHtml = inlineToken && Array.isArray(inlineToken.children)
      ? md.renderer.renderInline(inlineToken.children, md.options, env)
      : ''
    const { title, titleHtml } = buildOutlineHeadingContent(inlineHtml)
    const node = {
      key: id,
      href: `#${id}`,
      title,
      titleHtml,
      level: Number.parseInt(token.tag.slice(1), 10),
      lineStart: parseHeadingLineNumber(token.attrGet('data-line-start')),
      lineEnd: parseHeadingLineNumber(token.attrGet('data-line-end')),
      children: [],
    }

    // 寻找合适的父节点
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }

    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }

  return tree
}

export default {
  parseOutlineFromMarkdown,
}
