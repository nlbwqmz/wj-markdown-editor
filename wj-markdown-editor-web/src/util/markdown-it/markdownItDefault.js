import commonUtil from '@/util/commonUtil.js'
// import MarkdownItTextualUml from 'markdown-it-textual-uml'
import MarkdownItCodeBlock from '@/util/markdown-it/markdownItCodeBlock.js'
import markdownItContainerUtil from '@/util/markdown-it/markdownItContainerUtil.js'
import markdownItTextColor from '@/util/markdown-it/markdownItTextColor.js'
import { imgSize } from '@mdit/plugin-img-size'
import MarkdownItKatex from '@vscode/markdown-it-katex'
import MarkdownIt from 'markdown-it'
import MarkdownItAnchor from 'markdown-it-anchor'
import MarkdownItContainer from 'markdown-it-container'
import MarkdownItDefList from 'markdown-it-deflist'
import MarkdownItGitHubAlerts from 'markdown-it-github-alerts'
import MarkdownItIns from 'markdown-it-ins'
import MarkdownItMark from 'markdown-it-mark'
import MarkdownItSub from 'markdown-it-sub'
import MarkdownItSup from 'markdown-it-sup'
import MarkdownItTaskLists from 'markdown-it-task-lists'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: true,
  xhtmlOut: true,
})
md.use(MarkdownItSup)
  .use(MarkdownItSub)
  .use(MarkdownItDefList)
  .use(MarkdownItIns)
  .use(MarkdownItMark)
  .use(MarkdownItTaskLists)
  .use(MarkdownItGitHubAlerts)
  .use(MarkdownItKatex, { throwOnError: false })
  .use(MarkdownItCodeBlock)
  .use(MarkdownItAnchor)
  .use(imgSize)
  // .use(MarkdownItForInline, 'text_color', 'text', (tokens, idx) => {
  //   const content = tokens[idx].content
  //   const regex = /\{([^}]+)\}\(([^)]+)\)/g
  //   let lastIndex = 0
  //   let match
  //
  //   // 创建新的HTML token数组替换原内容
  //   const newTokens = []
  //
  //   // eslint-disable-next-line no-cond-assign
  //   while ((match = regex.exec(content)) !== null) {
  //     // 添加未匹配的文本作为普通text token
  //     if (lastIndex < match.index) {
  //       newTokens.push({
  //         type: 'text',
  //         content: content.slice(lastIndex, match.index),
  //       })
  //     }
  //     const color = match[1].trim()
  //     const text = match[2]
  //
  //     if (color.includes('linear-gradient')) {
  //       newTokens.push({
  //         type: 'html_inline', // 关键：标记为HTML类型
  //         content: `<span style="background:  ${color};
  //                   -webkit-background-clip: text;
  //                   background-clip: text;
  //                   color: transparent;">${text}</span>`,
  //       })
  //     } else {
  //       newTokens.push({
  //         type: 'html_inline', // 关键：标记为HTML类型
  //         content: `<span style="color:${color}">${text}</span>`,
  //       })
  //     }
  //
  //     lastIndex = match.index + match[0].length
  //   }
  //
  //   // 添加剩余文本
  //   if (lastIndex < content.length) {
  //     newTokens.push({
  //       type: 'text',
  //       content: content.slice(lastIndex),
  //     })
  //   }
  //
  //   // 替换原token
  //   tokens.splice(idx, 1, ...newTokens)
  // })

markdownItTextColor(md)

// md.inline.ruler.push('text_color', (state, silent) => {
//   const start = state.pos
//
//   if (state.src.charCodeAt(start) !== 0x7B)
//     return false
//   const match = state.src.slice(start).match(/^\{([^}]+)\}\(([^)]+)\)/)
//   if (!match)
//     return false
//
//   if (!silent) {
//     const token = state.push('html_inline', '', 0)
//     const color = match[1].trim()
//     const text = match[2]
//     if (color.includes('linear-gradient')) {
//       token.content = `<span style="background:  ${color};
//               -webkit-background-clip: text;
//               background-clip: text;
//               color: transparent;">${text}</span>`
//     } else {
//       token.content = `<span style="color:${match[1]}">${match[2]}</span>`
//     }
//   }
//
//   state.pos += match[0].length
//   return true
// })

// ------------ 给本地图片加上自定义协议 ------------
md.renderer.rules.image = (tokens, idx, options, env, slf) => {
  const token = tokens[idx]
  // "alt" attr MUST be set, even if empty. Because it's mandatory and
  // should be placed on proper position for tests.
  //
  // Replace content with actual value
  token.attrs[token.attrIndex('alt')][1] = slf.renderInlineAsText(token.children, options, env)
  if (token.attrs) {
    const srcIndex = token.attrs.findIndex(item => item && item[0] === 'src')
    if (srcIndex > -1) {
      const src = token.attrs[srcIndex][1]
      if (src) {
        if (!src.match('^http') && !src.match('^data')) {
          token.attrs[srcIndex][1] = `wj:///${commonUtil.stringToHex(src)}`
        }
      }
    }
  }
  return slf.renderToken(tokens, idx, options)
}
// ------------ 给链接加上_blank ------------
const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  // If you are sure other plugins can't add `target` - drop check below
  const targetIndex = tokens[idx].attrIndex('target')
  if (targetIndex < 0) {
    // add new attribute
    tokens[idx].attrPush(['target', '_blank'])
  } else {
    // replace value of existing attr
    tokens[idx].attrs[targetIndex][1] = '_blank'
  }

  const hrefIndex = tokens[idx].attrIndex('href')
  if (hrefIndex >= 0) {
    // add new attribute
    const href = tokens[idx].attrs[hrefIndex][1]
    if (href && !href.match('^http')) {
      tokens[idx].attrs[hrefIndex][1] = `wj:///${commonUtil.stringToHex(href)}`
    }
  }
  // pass token to default renderer.
  return defaultRender(tokens, idx, options, env, self)
}

// 添加原始文本对应的行号区域
md.core.ruler.push('line_number', (state) => {
  state.tokens.forEach((token) => {
    if (token.map) {
      // 闭开区间
      const [start, end] = token.map
      // 用户可见的行号从 1 开始，且闭开区间需转换为闭区间
      token.attrSet('data-line-start', String(start + 1))
      token.attrSet('data-line-end', String(end))
    }
  })
})

markdownItContainerUtil.createContainerPlugin(md, ['info', 'warning', 'danger', 'tip', 'important', 'details'])
  .forEach((containerPlugin) => {
    md.use(MarkdownItContainer, containerPlugin.type, containerPlugin)
  })

export default md
