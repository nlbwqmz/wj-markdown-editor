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
      t: value => value,
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

    expect(draftWrapper.get('[data-testid="file-manager-empty-state"]').text()).toContain('message.fileManagerSelectDirectory')

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
})
