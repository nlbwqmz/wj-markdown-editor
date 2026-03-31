import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

import FileManagerPanel from '../FileManagerPanel.vue'

const fileManagerPanelState = vi.hoisted(() => {
  const registeredHandlerMap = new Map()

  return {
    store: {
      fileManagerPanelVisible: true,
      documentSessionSnapshot: null,
    },
    requestFileManagerDirectoryState: vi.fn(),
    requestFileManagerOpenDirectory: vi.fn(),
    requestFileManagerCreateFolder: vi.fn(),
    requestFileManagerCreateMarkdown: vi.fn(),
    requestFileManagerPickDirectory: vi.fn(),
    openDecisionOpenDocument: vi.fn(),
    openDecisionFactory: vi.fn(),
    modalConfirm: vi.fn(),
    messageWarning: vi.fn(),
    registeredHandlerMap,
  }
})
const i18nState = vi.hoisted(() => ({
  t: vi.fn(value => `translated:${value}`),
}))

fileManagerPanelState.store = reactive(fileManagerPanelState.store)
const mountedWrapperList = []

function createDirectoryState({
  directoryPath = 'D:/docs',
  entryList = [],
} = {}) {
  return {
    directoryPath,
    entryList,
  }
}

function createDocumentSnapshot({
  sessionId = 'session-file-manager',
  path = 'D:/docs/current.md',
  isRecentMissing = false,
  recentMissingPath = null,
  dirty = false,
} = {}) {
  return {
    sessionId,
    displayPath: isRecentMissing ? recentMissingPath : path,
    recentMissingPath,
    isRecentMissing,
    dirty,
    resourceContext: {
      documentPath: isRecentMissing ? null : path,
    },
  }
}

async function flushFileManagerPanel() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function createDeferred() {
  let resolve = null
  let reject = null
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    Empty: defineComponent({
      name: 'AEmptyStub',
      setup(_props, { slots }) {
        return () => h('div', { 'data-testid': 'empty-stub' }, slots.default?.())
      },
    }),
    Input: defineComponent({
      name: 'AInputStub',
      props: {
        value: {
          type: String,
          default: '',
        },
      },
      emits: ['update:value'],
      setup(props, { emit }) {
        return () => h('input', {
          value: props.value,
          onInput: event => emit('update:value', event.target.value),
        })
      },
    }),
    Modal: {
      confirm: fileManagerPanelState.modalConfirm,
    },
    message: {
      warning: fileManagerPanelState.messageWarning,
      info: vi.fn(),
    },
  }
})

vi.mock('@/i18n/index.js', () => ({
  default: {
    global: {
      t: i18nState.t,
    },
  },
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return fileManagerPanelState.store
  },
}))

vi.mock('@/util/channel/eventEmit.js', () => ({
  default: {
    on: vi.fn((eventName, handler) => {
      fileManagerPanelState.registeredHandlerMap.set(eventName, handler)
    }),
    remove: vi.fn((eventName, handler) => {
      const currentHandler = fileManagerPanelState.registeredHandlerMap.get(eventName)
      if (currentHandler === handler) {
        fileManagerPanelState.registeredHandlerMap.delete(eventName)
      }
    }),
  },
}))

vi.mock('@/util/file-manager/fileManagerPanelCommandUtil.js', () => ({
  requestFileManagerDirectoryState: fileManagerPanelState.requestFileManagerDirectoryState,
  requestFileManagerOpenDirectory: fileManagerPanelState.requestFileManagerOpenDirectory,
  requestFileManagerCreateFolder: fileManagerPanelState.requestFileManagerCreateFolder,
  requestFileManagerCreateMarkdown: fileManagerPanelState.requestFileManagerCreateMarkdown,
  requestFileManagerPickDirectory: fileManagerPanelState.requestFileManagerPickDirectory,
}))

vi.mock('@/util/file-manager/fileManagerOpenDecisionController.js', () => ({
  createFileManagerOpenDecisionController: fileManagerPanelState.openDecisionFactory,
  resolveDocumentOpenCurrentPath(snapshot) {
    if (snapshot?.isRecentMissing === true) {
      return null
    }

    return snapshot?.resourceContext?.documentPath || snapshot?.displayPath || null
  },
}))

describe('fileManagerPanel 组件', () => {
  beforeEach(() => {
    fileManagerPanelState.store.fileManagerPanelVisible = true
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot()
    fileManagerPanelState.requestFileManagerDirectoryState.mockReset()
    fileManagerPanelState.requestFileManagerOpenDirectory.mockReset()
    fileManagerPanelState.requestFileManagerCreateFolder.mockReset()
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockReset()
    fileManagerPanelState.requestFileManagerPickDirectory.mockReset()
    fileManagerPanelState.openDecisionOpenDocument.mockReset()
    fileManagerPanelState.openDecisionFactory.mockReset()
    fileManagerPanelState.modalConfirm.mockReset()
    fileManagerPanelState.messageWarning.mockReset()
    fileManagerPanelState.registeredHandlerMap.clear()
    i18nState.t.mockClear()
    fileManagerPanelState.openDecisionFactory.mockReturnValue({
      openDocument: fileManagerPanelState.openDecisionOpenDocument,
    })
  })

  afterEach(() => {
    while (mountedWrapperList.length > 0) {
      mountedWrapperList.pop()?.unmount()
    }
    vi.clearAllMocks()
  })

  it('draft 会话应显示空状态，正常文件会话应显示目录列表并高亮当前文件', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: null,
    })

    const draftWrapper = mount(FileManagerPanel)
    mountedWrapperList.push(draftWrapper)
    await flushFileManagerPanel()

    expect(draftWrapper.get('[data-testid="file-manager-empty-state"]').text()).toContain('translated:message.fileManagerSelectDirectory')

    draftWrapper.unmount()

    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot()
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      entryList: [
        { name: 'assets', path: 'D:/docs/assets', kind: 'directory' },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-entry-current"]').classes()).toContain('is-active')
  })

  it('recent-missing 父目录存在时应展示该目录且无高亮，父目录不存在时应直接空状态', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      isRecentMissing: true,
      recentMissingPath: 'D:/docs/missing.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValueOnce(createDirectoryState({
      entryList: [
        { name: 'draft.md', path: 'D:/docs/draft.md', kind: 'markdown' },
      ],
    }))

    const resolvedWrapper = mount(FileManagerPanel)
    mountedWrapperList.push(resolvedWrapper)
    await flushFileManagerPanel()

    expect(resolvedWrapper.find('[data-testid="file-manager-entry-current"]').exists()).toBe(false)

    resolvedWrapper.unmount()

    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValueOnce(null)

    const emptyWrapper = mount(FileManagerPanel)
    mountedWrapperList.push(emptyWrapper)
    await flushFileManagerPanel()

    expect(emptyWrapper.get('[data-testid="file-manager-empty-state"]').exists()).toBe(true)
  })

  it('recent-missing 父目录存在但目录为空时，仍应保持目录态并显示目录空状态文案', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      isRecentMissing: true,
      recentMissingPath: 'D:/docs/missing.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('docs')
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').text()).toContain('translated:message.fileManagerDirectoryEmpty')
    expect(wrapper.find('[data-testid="file-manager-empty-open-directory"]').exists()).toBe(false)
  })

  it('recent-missing 父目录不存在时应保留空状态动作入口，但不显示额外文案', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      isRecentMissing: true,
      recentMissingPath: 'D:/docs/missing.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(null)

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toBe('')
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').text()).toBe('translated:message.fileManagerSelectDirectory')
    expect(wrapper.find('.file-manager-panel__empty-message').exists()).toBe(false)
    expect(wrapper.get('[data-testid="file-manager-empty-open-directory"]').exists()).toBe(true)
  })

  it('recent-missing 父目录不存在时，即使主进程返回 directoryPath:null 的空状态对象，也必须保持静默空状态', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      isRecentMissing: true,
      recentMissingPath: 'D:/docs/missing.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: null,
      entryList: [],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toBe('')
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').text()).toBe('translated:message.fileManagerSelectDirectory')
    expect(wrapper.find('.file-manager-panel__empty-message').exists()).toBe(false)
    expect(wrapper.get('[data-testid="file-manager-empty-open-directory"]').exists()).toBe(true)
  })

  it('文件管理栏工具区应显示当前目录标题或面包屑', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs/project',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('project')
  })

  it('目录、Markdown、其他文件应显示不同图标，长文件名保持单行省略', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      entryList: [
        { name: 'assets', path: 'D:/docs/assets', kind: 'directory' },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
        { name: 'very-long-attachment-name.zip', path: 'D:/docs/very-long-attachment-name.zip', kind: 'other' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-entry-icon-directory"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="file-manager-entry-icon-markdown"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="file-manager-entry-icon-other"]').exists()).toBe(true)
    wrapper.findAll('[data-testid="file-manager-entry-name"]').forEach((node) => {
      expect(node.classes()).toContain('truncate')
    })
  })

  it('点击目录项时应进入该目录', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      entryList: [
        { name: 'assets', path: 'D:/docs/assets', kind: 'directory' },
      ],
    }))
    fileManagerPanelState.requestFileManagerOpenDirectory.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs/assets',
      entryList: [
        { name: 'nested.md', path: 'D:/docs/assets/nested.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('.file-manager-panel__entry').trigger('click')
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerOpenDirectory).toHaveBeenCalledWith({
      directoryPath: 'D:/docs/assets',
    })
    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('assets')
  })

  it('点击当前 Markdown 时应无操作，不再重复触发统一打开决策', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('[data-testid="file-manager-entry-current"]').trigger('click')
    await flushFileManagerPanel()

    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()
  })

  it('点击其他文件类型时应提示当前仅支持 Markdown 打开', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      entryList: [
        { name: 'archive.zip', path: 'D:/docs/archive.zip', kind: 'other' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('.file-manager-panel__entry').trigger('click')
    await flushFileManagerPanel()

    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.onlyMarkdownFilesCanBeOpened')
    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()
  })

  it('点击工具区新建文件夹按钮后，应走创建文件夹链路', async () => {
    let folderDialogConfig = null
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [],
    }))
    fileManagerPanelState.requestFileManagerCreateFolder.mockResolvedValue({
      directoryState: createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'assets', path: 'D:/docs/assets', kind: 'directory' },
        ],
      }),
    })
    fileManagerPanelState.modalConfirm.mockImplementation((config) => {
      folderDialogConfig = config
      return {
        destroy: vi.fn(),
      }
    })

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('[data-testid="file-manager-create-folder"]').trigger('click')
    folderDialogConfig.content.props['onUpdate:value']('assets')
    await folderDialogConfig.onOk()
    await flushFileManagerPanel()

    expect(folderDialogConfig.title).toBe('translated:message.fileManagerCreateFolder')
    expect(fileManagerPanelState.requestFileManagerCreateFolder).toHaveBeenCalledWith({
      name: 'assets',
    })
    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('docs')
  })

  it('点击工具区新建 Markdown 按钮后，应继续走统一打开决策链路', async () => {
    let markdownDialogConfig = null
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [],
    }))
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockResolvedValue({
      path: 'D:/docs/draft-note.md',
      directoryState: createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'draft-note.md', path: 'D:/docs/draft-note.md', kind: 'markdown' },
        ],
      }),
    })
    fileManagerPanelState.modalConfirm.mockImplementation((config) => {
      markdownDialogConfig = config
      return {
        destroy: vi.fn(),
      }
    })

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('[data-testid="file-manager-create-markdown"]').trigger('click')
    markdownDialogConfig.content.props['onUpdate:value']('draft-note.md')
    await markdownDialogConfig.onOk()
    await flushFileManagerPanel()

    expect(markdownDialogConfig.title).toBe('translated:message.fileManagerCreateMarkdown')
    expect(fileManagerPanelState.requestFileManagerCreateMarkdown).toHaveBeenCalledWith({
      name: 'draft-note.md',
    })
    expect(fileManagerPanelState.openDecisionOpenDocument).toHaveBeenCalledWith(
      'D:/docs/draft-note.md',
      expect.objectContaining({
        source: 'file-panel-create-markdown',
      }),
    )
  })

  it('draft 空状态应提供选择目录入口，并在选择成功后切换到该目录', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: null,
    })
    fileManagerPanelState.requestFileManagerPickDirectory.mockResolvedValue('D:/workspace')
    fileManagerPanelState.requestFileManagerOpenDirectory.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/workspace',
      entryList: [
        { name: 'notes.md', path: 'D:/workspace/notes.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()
    await wrapper.get('[data-testid="file-manager-empty-open-directory"]').trigger('click')
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerPickDirectory).toHaveBeenCalledTimes(1)
    expect(fileManagerPanelState.requestFileManagerOpenDirectory).toHaveBeenCalledWith({
      directoryPath: 'D:/workspace',
    })
    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('workspace')
  })

  it('空状态与工具区标题应使用 t(emptyMessageKey) 渲染，而不是直接显示 message key', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: null,
    })

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('translated:message.fileManagerSelectDirectory')
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').text()).toContain('translated:message.fileManagerSelectDirectory')
  })

  it('中英文文案应补齐文件管理栏真实使用到的 key', async () => {
    const zhCN = (await import('@/i18n/zhCN.js')).default
    const enUS = (await import('@/i18n/enUS.js')).default

    expect(zhCN.message.fileManagerSelectDirectory).toBeTruthy()
    expect(zhCN.message.fileManagerDirectoryEmpty).toBeTruthy()
    expect(zhCN.message.fileManagerCreateFolder).toBeTruthy()
    expect(zhCN.message.fileManagerCreateMarkdown).toBeTruthy()
    expect(zhCN.message.fileManagerFolderNameRequired).toBeTruthy()
    expect(zhCN.message.fileManagerMarkdownNameRequired).toBeTruthy()
    expect(zhCN.message.fileManagerOpenDirectoryFailed).toBeTruthy()

    expect(enUS.message.fileManagerSelectDirectory).toBeTruthy()
    expect(enUS.message.fileManagerDirectoryEmpty).toBeTruthy()
    expect(enUS.message.fileManagerCreateFolder).toBeTruthy()
    expect(enUS.message.fileManagerCreateMarkdown).toBeTruthy()
    expect(enUS.message.fileManagerFolderNameRequired).toBeTruthy()
    expect(enUS.message.fileManagerMarkdownNameRequired).toBeTruthy()
    expect(enUS.message.fileManagerOpenDirectoryFailed).toBeTruthy()
  })

  it('文件管理栏样式应复用主题变量，不应残留亮色硬编码', async () => {
    const source = await readFile(path.resolve(process.cwd(), 'src/components/layout/FileManagerPanel.vue'), 'utf8')

    expect(source).not.toMatch(/#1677ff|#fff|rgba\(22,\s*119,\s*255,\s*0\.12\)/u)
    expect(source).toContain('var(--wj-markdown-bg-secondary)')
    expect(source).toContain('var(--wj-markdown-border-primary)')
  })

  it('pOSIX 路径仅大小写不同，不应把其他文件误高亮成当前文件', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: '/workspace/Readme.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: '/workspace',
      entryList: [
        { name: 'readme.md', path: '/workspace/readme.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.find('[data-testid="file-manager-entry-current"]').exists()).toBe(false)
  })
})

describe('fileManagerPanelController', () => {
  beforeEach(() => {
    fileManagerPanelState.store.fileManagerPanelVisible = true
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot()
    fileManagerPanelState.requestFileManagerDirectoryState.mockReset()
    fileManagerPanelState.requestFileManagerOpenDirectory.mockReset()
    fileManagerPanelState.requestFileManagerCreateFolder.mockReset()
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockReset()
    fileManagerPanelState.requestFileManagerPickDirectory.mockReset()
    fileManagerPanelState.openDecisionOpenDocument.mockReset()
    fileManagerPanelState.openDecisionFactory.mockReset()
    fileManagerPanelState.modalConfirm.mockReset()
    fileManagerPanelState.messageWarning.mockReset()
    fileManagerPanelState.registeredHandlerMap.clear()
    fileManagerPanelState.openDecisionFactory.mockReturnValue({
      openDocument: fileManagerPanelState.openDecisionOpenDocument,
    })
  })

  it('当前窗口切换文档后，文件管理栏应依据新的 session snapshot 重新解析目录并更新高亮', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerDirectoryState
      .mockResolvedValueOnce(createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
        ],
      }))
      .mockResolvedValueOnce(createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'next.md', path: 'D:/docs/next.md', kind: 'markdown' },
        ],
      }))

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
      })
    })

    await flushFileManagerPanel()

    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: 'D:/docs/next.md',
    })
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(2)
    expect(controller.entryList.value[0].isActive).toBe(true)

    scope.stop()
  })

  it('点击新建文件夹或新建 Markdown 时应先弹出单输入框 Modal 收集名称，取消时不发起创建', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const openNameInputModal = vi.fn().mockResolvedValue(null)

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
        openNameInputModal,
      })
    })

    await controller.requestCreateFolderFromInput()
    await controller.requestCreateMarkdownFromInput()

    expect(openNameInputModal).toHaveBeenCalledTimes(2)
    expect(fileManagerPanelState.requestFileManagerCreateFolder).not.toHaveBeenCalled()
    expect(fileManagerPanelState.requestFileManagerCreateMarkdown).not.toHaveBeenCalled()

    scope.stop()
  })

  it('新建文件夹输入非法名称时应立即提示，且不发起创建命令', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const openNameInputModal = vi.fn().mockResolvedValue('../escape-dir')

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => `translated:${value}`,
        openNameInputModal,
      })
    })

    await controller.requestCreateFolderFromInput()

    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerInvalidEntryName')
    expect(fileManagerPanelState.requestFileManagerCreateFolder).not.toHaveBeenCalled()

    scope.stop()
  })

  it('新建 Markdown 输入非法名称时应立即提示，且不发起创建与打开链路', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const openNameInputModal = vi.fn().mockResolvedValue('nested/draft-note')

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => `translated:${value}`,
        openNameInputModal,
      })
    })

    await controller.requestCreateMarkdownFromInput()

    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerInvalidEntryName')
    expect(fileManagerPanelState.requestFileManagerCreateMarkdown).not.toHaveBeenCalled()
    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()

    scope.stop()
  })

  it('新建文件夹成功后应刷新当前目录列表', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const openNameInputModal = vi.fn().mockResolvedValue('assets')
    fileManagerPanelState.requestFileManagerCreateFolder.mockResolvedValue({
      directoryState: createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'assets', path: 'D:/docs/assets', kind: 'directory' },
        ],
      }),
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
        openNameInputModal,
      })
    })

    await controller.requestCreateFolderFromInput()

    expect(controller.entryList.value[0].name).toBe('assets')

    scope.stop()
  })

  it('createFolder 在未传名称时应先请求名称，再调用创建能力', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const openNameInputModal = vi.fn().mockResolvedValue('assets')
    fileManagerPanelState.requestFileManagerCreateFolder.mockResolvedValue({
      directoryState: createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'assets', path: 'D:/docs/assets', kind: 'directory' },
        ],
      }),
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
        openNameInputModal,
      })
    })

    await controller.createFolder()

    expect(openNameInputModal).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'folder',
    }))
    expect(fileManagerPanelState.requestFileManagerCreateFolder).toHaveBeenCalledWith({
      name: 'assets',
    })

    scope.stop()
  })

  it('electron 返回 invalid-file-manager-entry-name 时，不应清空当前目录状态', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerCreateFolder.mockResolvedValue({
      ok: false,
      reason: 'invalid-file-manager-entry-name',
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
      })
    })

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const result = await controller.createFolder('assets')

    expect(result).toEqual({
      ok: false,
      reason: 'invalid-file-manager-entry-name',
    })
    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])

    scope.stop()
  })

  it('createFolder 收到顶层 open-directory-watch-failed 时，必须保留旧目录状态并提示失败', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerCreateFolder.mockResolvedValue({
      ok: false,
      reason: 'open-directory-watch-failed',
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => `translated:${value}`,
      })
    })

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const result = await controller.createFolder('assets')

    expect(result).toEqual({
      ok: false,
      reason: 'open-directory-watch-failed',
    })
    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])
    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerOpenDirectoryFailed')

    scope.stop()
  })

  it('renderer 收到 open-directory-watch-failed 时，必须保留旧目录状态并提示失败', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerOpenDirectory.mockResolvedValue({
      ok: false,
      reason: 'open-directory-watch-failed',
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => `translated:${value}`,
      })
    })

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const result = await controller.openDirectory('D:/other')

    expect(result).toEqual({
      ok: false,
      reason: 'open-directory-watch-failed',
    })
    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])
    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerOpenDirectoryFailed')

    scope.stop()
  })

  it('初次 reloadDirectoryStateFromSnapshot 收到 open-directory-watch-failed 时，必须保持空状态并提示失败', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue({
      ok: false,
      reason: 'open-directory-watch-failed',
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => `translated:${value}`,
      })
    })

    await flushFileManagerPanel()

    expect(controller.directoryPath.value).toBeNull()
    expect(controller.entryList.value).toEqual([])
    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerOpenDirectoryFailed')

    scope.stop()
  })

  it('新建 Markdown 成功后应复用统一打开决策控制器', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const openNameInputModal = vi.fn().mockResolvedValue('draft-note.md')
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockResolvedValue({
      path: 'D:/docs/draft-note.md',
      directoryState: createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'draft-note.md', path: 'D:/docs/draft-note.md', kind: 'markdown' },
        ],
      }),
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
        openNameInputModal,
      })
    })

    await controller.requestCreateMarkdownFromInput()

    expect(fileManagerPanelState.openDecisionOpenDocument).toHaveBeenCalledWith(
      expect.stringContaining('draft-note.md'),
      expect.objectContaining({
        source: 'file-panel-create-markdown',
      }),
    )

    scope.stop()
  })

  it('createMarkdown 在未传名称时应先请求名称，并继续复用统一打开决策', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const openNameInputModal = vi.fn().mockResolvedValue('draft-note.md')
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockResolvedValue({
      path: 'D:/docs/draft-note.md',
      directoryState: createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'draft-note.md', path: 'D:/docs/draft-note.md', kind: 'markdown' },
        ],
      }),
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
        openNameInputModal,
      })
    })

    await controller.createMarkdown()

    expect(openNameInputModal).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'markdown',
    }))
    expect(fileManagerPanelState.requestFileManagerCreateMarkdown).toHaveBeenCalledWith({
      name: 'draft-note.md',
    })
    expect(fileManagerPanelState.openDecisionOpenDocument).toHaveBeenCalledWith(
      expect.stringContaining('draft-note.md'),
      expect.objectContaining({
        source: 'file-panel-create-markdown',
      }),
    )

    scope.stop()
  })

  it('createMarkdown 收到非法名称失败时不应继续走打开链路，且应保留当前目录状态', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockResolvedValue({
      ok: false,
      reason: 'invalid-file-manager-entry-name',
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
      })
    })

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const result = await controller.createMarkdown('draft-note')

    expect(result).toEqual({
      ok: false,
      reason: 'invalid-file-manager-entry-name',
    })
    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()
    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])

    scope.stop()
  })

  it('createMarkdown 收到同名已存在失败时，必须提示用户且不能继续走打开链路', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockResolvedValue({
      ok: false,
      reason: 'file-manager-entry-already-exists',
      path: 'D:/docs/draft-note.md',
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => `translated:${value}`,
      })
    })

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const result = await controller.createMarkdown('draft-note')

    expect(result).toEqual({
      ok: false,
      reason: 'file-manager-entry-already-exists',
      path: 'D:/docs/draft-note.md',
    })
    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerEntryAlreadyExists')
    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()
    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])

    scope.stop()
  })

  it('createMarkdown 收到顶层 open-directory-watch-failed 时，必须保留旧目录状态、提示失败且不继续走打开链路', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockResolvedValue({
      ok: false,
      reason: 'open-directory-watch-failed',
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => `translated:${value}`,
      })
    })

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const result = await controller.createMarkdown('draft-note')

    expect(result).toEqual({
      ok: false,
      reason: 'open-directory-watch-failed',
    })
    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])
    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerOpenDirectoryFailed')
    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()

    scope.stop()
  })

  it('createMarkdown 收到 nested open-directory-watch-failed 时，必须保留旧目录状态、提示失败且不继续走打开链路', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockResolvedValue({
      path: 'D:/docs/draft-note.md',
      directoryState: {
        ok: false,
        reason: 'open-directory-watch-failed',
      },
    })

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => `translated:${value}`,
      })
    })

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const result = await controller.createMarkdown('draft-note')

    expect(result).toEqual({
      path: 'D:/docs/draft-note.md',
      directoryState: {
        ok: false,
        reason: 'open-directory-watch-failed',
      },
    })
    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])
    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerOpenDirectoryFailed')
    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()

    scope.stop()
  })

  it('收到目录变更事件后应直接应用最新目录状态', async () => {
    const { FILE_MANAGER_DIRECTORY_CHANGED_EVENT } = await import('@/util/file-manager/fileManagerEventUtil.js')
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
      })
    })

    await flushFileManagerPanel()

    const changedHandler = fileManagerPanelState.registeredHandlerMap.get(FILE_MANAGER_DIRECTORY_CHANGED_EVENT)
    changedHandler(createDirectoryState({
      directoryPath: 'D:/incoming',
      entryList: [
        { name: 'fresh.md', path: 'D:/incoming/fresh.md', kind: 'markdown' },
      ],
    }))
    await flushFileManagerPanel()

    expect(controller.directoryPath.value).toBe('D:/incoming')
    expect(controller.entryList.value[0].name).toBe('fresh.md')

    scope.stop()
  })

  it('根目录场景下仍应请求并保留目录态，而不是直接退回空状态', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: '/README.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: '/',
      entryList: [
        { name: 'README.md', path: '/README.md', kind: 'markdown' },
      ],
    }))

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
      })
    })

    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledWith({
      directoryPath: '/',
    })
    expect(controller.directoryPath.value).toBe('/')
    expect(controller.hasDirectory.value).toBe(true)

    scope.stop()
  })

  it('较晚发起的目录请求先返回后，较早请求的旧结果不应覆盖最新目录状态', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const staleRequest = createDeferred()
    const latestRequest = createDeferred()
    fileManagerPanelState.requestFileManagerDirectoryState
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => latestRequest.promise)

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
      })
    })

    await flushFileManagerPanel()

    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: 'D:/other/next.md',
    })
    await flushFileManagerPanel()

    latestRequest.resolve(createDirectoryState({
      directoryPath: 'D:/other',
      entryList: [
        { name: 'next.md', path: 'D:/other/next.md', kind: 'markdown' },
      ],
    }))
    await flushFileManagerPanel()

    expect(controller.directoryPath.value).toBe('D:/other')
    expect(controller.entryList.value[0].name).toBe('next.md')
    expect(controller.loading.value).toBe(false)

    staleRequest.resolve(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))
    await flushFileManagerPanel()

    expect(controller.directoryPath.value).toBe('D:/other')
    expect(controller.entryList.value[0].name).toBe('next.md')
    expect(controller.loading.value).toBe(false)

    scope.stop()
  })

  it('目录变更事件如果代表更新状态，较早请求的旧结果不应再覆盖它', async () => {
    const { FILE_MANAGER_DIRECTORY_CHANGED_EVENT } = await import('@/util/file-manager/fileManagerEventUtil.js')
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const staleRequest = createDeferred()
    fileManagerPanelState.requestFileManagerDirectoryState.mockImplementationOnce(() => staleRequest.promise)

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
      })
    })

    await flushFileManagerPanel()

    const changedHandler = fileManagerPanelState.registeredHandlerMap.get(FILE_MANAGER_DIRECTORY_CHANGED_EVENT)
    changedHandler(createDirectoryState({
      directoryPath: 'D:/incoming',
      entryList: [
        { name: 'fresh.md', path: 'D:/incoming/fresh.md', kind: 'markdown' },
      ],
    }))
    await flushFileManagerPanel()

    expect(controller.directoryPath.value).toBe('D:/incoming')
    expect(controller.entryList.value[0].name).toBe('fresh.md')

    staleRequest.resolve(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))
    await flushFileManagerPanel()

    expect(controller.directoryPath.value).toBe('D:/incoming')
    expect(controller.entryList.value[0].name).toBe('fresh.md')

    scope.stop()
  })
})
