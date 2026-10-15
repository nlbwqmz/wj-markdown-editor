import { renderCodeBlockHtml } from './markdownItCodeBlock.js'

const FRONT_MATTER_FENCE_PATTERN = /^-{3}\s*$/u
const FRONT_MATTER_LANGUAGE = 'yaml'
const BOM_CODE_POINT = 0xFEFF

/**
 * 读取一行文本，首行允许跳过 UTF-8 BOM。
 * 行首缩进不参与匹配：分隔符必须从行首开始。
 */
function resolveLineText(state, line) {
  let start = state.bMarks[line]
  if (line === 0 && state.src.charCodeAt(start) === BOM_CODE_POINT) {
    start += 1
  }
  return state.src.slice(start, state.eMarks[line])
}

function isFenceLine(state, line) {
  if (state.tShift[line] !== 0) {
    return false
  }
  return FRONT_MATTER_FENCE_PATTERN.test(resolveLineText(state, line))
}

/**
 * 识别文档最开头的 YAML front matter（`---` ... `---`）。
 * 只认首行的 `---` 与独占一行的 `---` 结束符；不认 `...`、不认 3 个以上连字符、不认非首行。
 *
 * 结束符取"从第 2 行起遇到的第一个符合规则的行"，不做空行边界或扫描范围启发式：
 * 若用户漏写结束符、而文档后面又有 `---` 分割线，中间内容会被当作 front matter 吞掉。
 * 这是刻意的取舍——与 markdown-it-front-matter / gray-matter / micromark 等主流实现一致，
 * 而任何收紧规则（空行边界、YAML 校验）都会误伤合法写法（顶层键之间夹空行、块标量内含空行）。
 * 全文找不到结束符时返回 false，回退为普通 Markdown 渲染。
 */
function frontMatterRule(state, startLine, endLine, silent) {
  if (startLine !== 0 || !isFenceLine(state, startLine)) {
    return false
  }

  let closeLine = -1
  for (let line = startLine + 1; line < endLine; line++) {
    if (isFenceLine(state, line)) {
      closeLine = line
      break
    }
  }

  if (closeLine === -1) {
    return false
  }

  if (silent) {
    return true
  }

  state.line = closeLine + 1
  const content = state.getLines(startLine + 1, closeLine, 0, false)

  // 空 front matter 不产出任何内容
  if (content.trim() === '') {
    return true
  }

  const token = state.push('front_matter', '', 0)
  token.block = true
  token.map = [startLine, closeLine + 1]
  token.content = content
  token.info = FRONT_MATTER_LANGUAGE
  return true
}

/**
 * 将 front matter 渲染为不带工具栏的代码块，复用现有代码块渲染与分帧高亮链路。
 */
export default function frontMatterPlugin(md) {
  md.block.ruler.before('table', 'front_matter', frontMatterRule, { alt: [] })

  md.renderer.rules.front_matter = (tokens, idx) => {
    const token = tokens[idx]
    return renderCodeBlockHtml(token, token.info, token.content.trim(), md, { showToolbar: false })
  }
}
