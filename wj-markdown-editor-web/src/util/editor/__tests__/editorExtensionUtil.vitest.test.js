import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'

import editorExtensionUtil from '../editorExtensionUtil.js'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('editorExtensionUtil 编辑宿主保护', () => {
  it('默认扩展必须给 cm-content 添加宿主输入保护属性，避免浏览器改写编辑 DOM', () => {
    const mountTarget = document.createElement('div')
    document.body.appendChild(mountTarget)

    const view = new EditorView({
      doc: '# 标题',
      parent: mountTarget,
      extensions: editorExtensionUtil.getDefault(),
    })

    try {
      expect(view.contentDOM.getAttribute('spellcheck')).toBe('false')
      expect(view.contentDOM.getAttribute('autocorrect')).toBe('off')
      expect(view.contentDOM.getAttribute('autocapitalize')).toBe('off')
      expect(view.contentDOM.getAttribute('translate')).toBe('no')
    } finally {
      view.destroy()
    }
  })
})
