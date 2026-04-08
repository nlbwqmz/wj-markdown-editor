import {
  autocompletion,
  closeBrackets,
} from '@codemirror/autocomplete'
import { history } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, search } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { EditorView } from 'codemirror'
import completionHandler from '@/util/editor/completion/completionHandler.js'

/**
 * 固定的插件
 */
const fixedExtension = [
  history(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  search({
    // 显式使用当前编辑器实例对应的 EditorView 生成滚动效果，避免 @codemirror/search 内部依赖的 view 副本导致跳转仅更新选区、不触发滚动
    scrollToMatch: range => EditorView.scrollIntoView(range, { y: 'center' }),
  }),
  markdown({ codeLanguages: languages }),
  EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '1rem',
    },
    '.cm-line': {
      fontFamily: 'var(--edit-area-font)', // 字体
    },
    '.cm-completionLabel': {
      fontFamily: 'var(--edit-area-font)', // 字体
    },
    '.cm-content': {
      lineHeight: '1.5',
      paddingBottom: 'var(--wj-editor-bottom-gap, 40vh)',
    },
    '.cm-gutterElement': {
      userSelect: 'none',
      padding: '0 !important',
      textAlign: 'center !important',
    },
    '.cm-scroller': {
      overflowY: 'scroll',
    },
    // 自定义搜索框依赖于原生的搜索框组件 设置原生搜索框不显示 若height不设置为0，会导致切换上一个或者下一个匹配项时，高度计算不正确，不能保证匹配项在可视区域
    '.cm-panels:has(.cm-search.cm-panel)': {
      height: 0,
      overflow: 'hidden',
    },
  }),
  autocompletion({
    override: [
      completionHandler,
    ],
  }),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  EditorState.allowMultipleSelections.of(true),
  highlightSpecialChars(),
  rectangularSelection(),
  crosshairCursor(),
]

const editorExtensionUtil = {
  getDefault: () => {
    return [
      ...fixedExtension,
    ]
  },
  getDynamicExtension: () => {
    return {
      lineNumbers: {
        extension: [lineNumbers()],
        compartment: new Compartment(),
      },
      lineWrapping: {
        extension: [EditorView.lineWrapping],
        compartment: new Compartment(),
      },
      highlightActiveLine: {
        extension: [highlightActiveLine()],
        compartment: new Compartment(),
      },
      highlightSelectionMatches: {
        extension: [highlightSelectionMatches()],
        compartment: new Compartment(),
      },
      bracketMatching: {
        extension: [bracketMatching()],
        compartment: new Compartment(),
      },
      closeBrackets: {
        extension: [closeBrackets()],
        compartment: new Compartment(),
      },
    }
  },
}

export default editorExtensionUtil
