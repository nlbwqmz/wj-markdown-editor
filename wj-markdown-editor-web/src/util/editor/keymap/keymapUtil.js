import editorUtil from '@/util/editor/editorUtil.js'
import { completionKeymap, startCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { openSearchPanel, searchKeymap } from '@codemirror/search'

const fixedKeymap = [
  {
    key: 'Backspace',
    run: (view) => {
      startCompletion(view)
    },
  },
  // ...closeBracketsKeymap,
  ...defaultKeymap,
  ...searchKeymap,
  ...historyKeymap,
  // ...foldKeymap,
  ...completionKeymap,
  // ...lintKeymap,
  indentWithTab,
  // 阻止冒泡到全局快捷键
  {
    key: 'Ctrl-f',
    preventDefault: true,
    stopPropagation: true,
    run: (view) => {
      openSearchPanel(view)
      return true
    },
  },
]

const dynamicKeymap = {
  'editor-bold': (editorView) => { editorUtil.bold(editorView) },
  'editor-underline': (editorView) => { editorUtil.underline(editorView) },
  'editor-italic': (editorView) => { editorUtil.italic(editorView) },
  'editor-del': (editorView) => { editorUtil.strikeThrough(editorView) },
  'editor-subscript': (editorView) => { editorUtil.subscript(editorView) },
  'editor-superscript': (editorView) => { editorUtil.superscript(editorView) },
  'editor-quote': (editorView) => { editorUtil.quote(editorView) },
  'editor-list': (editorView) => { editorUtil.list(editorView) },
  'editor-list-numbers': (editorView) => { editorUtil.numberList(editorView) },
  'editor-list-check': (editorView) => { editorUtil.taskList(editorView) },
  'editor-code-inline': (editorView) => { editorUtil.code(editorView) },
  'editor-code-block': (editorView) => { editorUtil.blockCode(editorView) },
  'editor-link': (editorView) => { editorUtil.link(editorView) },
  'editor-mark': (editorView) => { editorUtil.mark(editorView) },
  'editor-heading-1': (editorView) => { editorUtil.heading(editorView, 1) },
  'editor-heading-2': (editorView) => { editorUtil.heading(editorView, 2) },
  'editor-heading-3': (editorView) => { editorUtil.heading(editorView, 3) },
  'editor-heading-4': (editorView) => { editorUtil.heading(editorView, 4) },
  'editor-heading-5': (editorView) => { editorUtil.heading(editorView, 5) },
  'editor-heading-6': (editorView) => { editorUtil.heading(editorView, 6) },
  'editor-image-template': (editorView) => { editorUtil.image(editorView) },
  'editor-screenshot': (editorView) => { editorUtil.screenshot(editorView, false) },
  'editor-screenshot-hide': (editorView) => { editorUtil.screenshot(editorView, true) },
  'editor-focus-line': () => {},
}

export default {
  createKeymap: (shortcutKeyList, overrideHandler) => {
    const keymapList = [...fixedKeymap]
    for (const shortcutKeyId in dynamicKeymap) {
      const shortcutKey = shortcutKeyList.find(item => item.id === shortcutKeyId && item.enabled === true)
      if (shortcutKey && shortcutKey.keymap) {
        let run
        if (overrideHandler && overrideHandler[shortcutKeyId]) {
          run = overrideHandler[shortcutKeyId]
        } else {
          run = dynamicKeymap[shortcutKeyId]
        }
        keymapList.push({
          key: shortcutKey.keymap.replaceAll('+', '-'),
          preventDefault: true,
          stopPropagation: true,
          run,
        })
      }
    }
    return keymapList
  },
}
