import fs from 'node:fs'

import { autocompletion, startCompletion } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function createAutocompleteOptions(count = 32) {
  return Array.from({ length: count }, (_, index) => ({
    label: `item-${index}`,
    type: 'text',
  }))
}

function createEditorView() {
  const parent = document.createElement('div')
  document.body.appendChild(parent)

  return new EditorView({
    state: EditorState.create({
      doc: 'item',
      extensions: [
        autocompletion({
          override: [
            context => ({
              from: context.pos,
              options: createAutocompleteOptions(),
            }),
          ],
        }),
      ],
    }),
    parent,
  })
}

async function flushAutocomplete() {
  await new Promise(resolve => setTimeout(resolve, 50))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('scrollbar autocomplete coverage', () => {
  it('滚动条共享样式必须覆盖挂在 cm-editor 根节点下的自动补全列表滚动容器', async () => {
    const view = createEditorView()

    try {
      view.focus()
      const didStart = startCompletion(view)
      await flushAutocomplete()
      expect(didStart).toBe(true)

      const tooltipList = view.dom.querySelector('.cm-tooltip-autocomplete > ul')
      expect(tooltipList).not.toBeNull()
      expect(tooltipList?.closest('.cm-editor')).toBe(view.dom)
      expect(tooltipList?.closest('.cm-scroller')).toBeNull()

      const scrollStyleSource = readSource('../scroll.scss')
      expect(scrollStyleSource.includes('.cm-tooltip-autocomplete > ul')).toBe(true)
    } finally {
      view.destroy()
    }
  })
})
