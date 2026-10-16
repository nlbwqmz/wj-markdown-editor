import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'

import editorUtil from '../editorUtil.js'

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: vi.fn(),
    sendSync: vi.fn(),
    getWebFilePath: vi.fn(),
  },
}))

vi.mock('@/util/commonUtil.js', () => ({
  default: {
    upperCaseFirst: value => value,
  },
}))

// 这两个用例验证的是“格式化结果如何回写到视图”的时序，不是 Prettier 本身。
// 真实 Prettier 首次动态加载耗时在并行测试下不稳定，会让用例靠猜延时失败；
// 这里用异步假实现替代，既保留异步语义又消除加载抖动。
vi.mock('prettier/standalone', () => ({
  format: async (content) => {
    // 模拟 markdown 格式化：标题与紧随其后的列表之间补一个空行。
    return content.replace(/^(#.*\n)(?=- )/m, '$1\n')
  },
}))

vi.mock('prettier/parser-markdown', () => ({
  default: {},
}))

afterEach(() => {
  document.body.innerHTML = ''
})

function createPendingStateFlushEditorView(content) {
  let currentContent = content
  let stateVersion = 1

  return {
    state: {
      doc: {
        toString: () => currentContent,
      },
      update: ({ changes }) => ({
        changes,
        startVersion: stateVersion,
      }),
    },
    dispatch: (payload) => {
      // 模拟 CodeMirror 在真正应用外部更新前，先冲刷一笔由失焦等 DOM 变化触发的内部事务。
      stateVersion += 1

      if (Object.prototype.hasOwnProperty.call(payload, 'startVersion') && payload.startVersion !== stateVersion) {
        throw new RangeError('Trying to update state with a transaction that doesn\'t start from the previous state.')
      }

      currentContent = payload.changes.insert
    },
    getContent: () => currentContent,
  }
}

describe('editorUtil.doPrettier', () => {
  it('点击外部工具栏导致编辑器状态先被内部事务推进时，仍应成功完成美化', async () => {
    const view = createPendingStateFlushEditorView('# title\n- item\n')
    const rejectionList = []
    const handleUnhandledRejection = (event) => {
      rejectionList.push(event.reason)
    }
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    try {
      await editorUtil.doPrettier(view)

      expect(rejectionList).toHaveLength(0)
      expect(view.getContent()).toBe('# title\n\n- item\n')
    } finally {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  })

  it('应将格式化后的 Markdown 回写到真实 CodeMirror 视图', async () => {
    const mountTarget = document.createElement('div')
    const triggerButton = document.createElement('button')
    triggerButton.type = 'button'
    triggerButton.textContent = 'prettier'
    document.body.appendChild(mountTarget)
    document.body.appendChild(triggerButton)
    const view = new EditorView({
      doc: '# title\n- item\n',
      parent: mountTarget,
    })
    const rejectionList = []
    const handleUnhandledRejection = (event) => {
      rejectionList.push(event.reason)
    }
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    try {
      view.focus()
      triggerButton.focus()
      let prettierPromise
      triggerButton.addEventListener('click', () => {
        prettierPromise = editorUtil.doPrettier(view)
      }, { once: true })
      triggerButton.click()
      await prettierPromise

      expect(rejectionList).toHaveLength(0)
      expect(view.state.doc.toString()).toBe('# title\n\n- item\n')
    } finally {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      view.destroy()
    }
  })
})
