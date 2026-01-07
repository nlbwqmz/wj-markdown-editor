import completionHandler from '@/util/editor/completion/completionHandler.js'
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

/**
 * 固定的插件
 */
const fixedExtension = [
  history(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  search(),
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
    '*::-webkit-scrollbar': {
      display: 'revert',
      width: '6px',
      height: '6px',
    },
    /* 滚动条里面轨道 */
    '*::-webkit-scrollbar-track': {
      backgroundColor: 'var(--wj-markdown-scroll-bg)',
    },
    '*::-webkit-scrollbar-corner': {
      backgroundColor: 'var(--wj-markdown-scroll-bg)',
    },
    /* 滚动条的样式 */
    '*::-webkit-scrollbar-thumb': {
      borderRadius: '4px',
      backgroundColor: '#0000004d',
    },
    '*::-webkit-scrollbar-thumb:hover': {
      backgroundColor: '#00000059',
    },
    '*::-webkit-scrollbar-thumb:active': {
      backgroundColor: '#00000061',
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
