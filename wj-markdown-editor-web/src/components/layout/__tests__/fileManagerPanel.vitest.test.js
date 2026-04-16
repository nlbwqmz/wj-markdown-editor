import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { mount } from '@vue/test-utils'
import { compileString } from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

import IconButton from '@/components/editor/IconButton.vue'
import FileManagerPanel from '../FileManagerPanel.vue'

const fileManagerPanelState = vi.hoisted(() => {
  const registeredHandlerMap = new Map()

  return {
    store: {
      fileManagerPanelVisible: true,
      documentSessionSnapshot: null,
      config: {
        language: 'zh-CN',
        fileManagerSort: {
          field: 'type',
          direction: 'asc',
        },
      },
    },
    requestFileManagerDirectoryState: vi.fn(),
    requestFileManagerOpenDirectory: vi.fn(),
    requestFileManagerCreateFolder: vi.fn(),
    requestFileManagerCreateMarkdown: vi.fn(),
    requestFileManagerSyncCurrentDirectoryOptions: vi.fn(),
    requestFileManagerPickDirectory: vi.fn(),
    openDecisionOpenDocument: vi.fn(),
    channelSend: vi.fn(),
    modalConfirm: vi.fn(),
    messageWarning: vi.fn(),
    scrollIntoView: vi.fn(),
    registeredHandlerMap,
  }
})
const i18nState = vi.hoisted(() => ({
  translationPrefixMap: {
    'zh-CN': 'translated',
    'en-US': 'localized',
  },
  t: vi.fn(),
}))

fileManagerPanelState.store = reactive(fileManagerPanelState.store)
i18nState.t.mockImplementation((value) => {
  const language = fileManagerPanelState.store.config.language || 'zh-CN'
  const prefix = i18nState.translationPrefixMap[language] || 'translated'
  return `${prefix}:${value}`
})
const mountedWrapperList = []

function resolveSetupStateBinding(binding) {
  return binding?.value ?? binding
}

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

function findFileManagerEntryByName(wrapper, name) {
  const entry = wrapper.findAll('.file-manager-panel__entry')
    .find(node => node.text().includes(name))

  if (!entry) {
    throw new Error(`未找到文件项：${name}`)
  }

  return entry
}

async function loadFileManagerPanelCompiledStyle() {
  const source = await readFile(path.resolve(process.cwd(), 'src/components/layout/FileManagerPanel.vue'), 'utf8')
  const { descriptor } = parse(source)
  const styleBlock = descriptor.styles[0]

  if (!styleBlock) {
    throw new Error('FileManagerPanel.vue 缺少样式块')
  }

  return compileString(styleBlock.content, {
    syntax: 'scss',
  }).css
}

function extractCssRuleDeclarations(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matched = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'u'))

  if (!matched) {
    throw new Error(`未找到选择器：${selector}`)
  }

  return matched[1]
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .reduce((declarationMap, declaration) => {
      const [property, ...valueList] = declaration.split(':')

      declarationMap.set(property.trim(), valueList.join(':').trim())
      return declarationMap
    }, new Map())
}

function extractVNodeText(content, visited = new Set()) {
  if (typeof content === 'string') {
    return content
  }
  if (typeof content === 'number') {
    return String(content)
  }
  if (Array.isArray(content)) {
    return content.map(item => extractVNodeText(item, visited)).join('')
  }
  if (!content || typeof content !== 'object') {
    return ''
  }
  if (visited.has(content)) {
    return ''
  }
  visited.add(content)

  return extractVNodeText(content.children, visited)
}

function containsVNodeClass(content, expectedClass, visited = new Set()) {
  if (Array.isArray(content)) {
    return content.some(item => containsVNodeClass(item, expectedClass, visited))
  }

  if (!content || typeof content !== 'object') {
    return false
  }
  if (visited.has(content)) {
    return false
  }
  visited.add(content)

  const classValue = content.props?.class ?? ''
  const classList = Array.isArray(classValue) ? classValue.join(' ') : String(classValue)

  return classList.split(/\s+/u).includes(expectedClass) || containsVNodeClass(content.children, expectedClass, visited)
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
      props: {
        description: {
          type: null,
          default: null,
        },
      },
      setup(props, { slots }) {
        return () => {
          const descriptionChildren = slots.description?.() ?? [props.description]

          return h('div', { 'data-testid': 'empty-stub' }, [
            ...descriptionChildren,
            ...(slots.default?.() || []),
          ])
        }
      },
    }),
    Input: defineComponent({
      name: 'AInputStub',
      inheritAttrs: false,
      props: {
        value: {
          type: String,
          default: '',
        },
        placeholder: {
          type: String,
          default: '',
        },
        type: {
          type: String,
          default: 'text',
        },
        allowClear: {
          type: Boolean,
          default: false,
        },
      },
      emits: ['update:value'],
      setup(props, { attrs, emit }) {
        return () => h('div', attrs, [
          h('input', {
            value: props.value,
            type: props.type,
            placeholder: props.placeholder,
            onInput: event => emit('update:value', event.target.value),
          }),
          props.allowClear && props.value
            ? h('button', {
                'type': 'button',
                'data-testid': 'file-manager-search-clear',
                'onClick': () => emit('update:value', ''),
              })
            : null,
        ])
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
  requestFileManagerSyncCurrentDirectoryOptions: fileManagerPanelState.requestFileManagerSyncCurrentDirectoryOptions,
  requestFileManagerPickDirectory: fileManagerPanelState.requestFileManagerPickDirectory,
}))

vi.mock('@/util/document-session/documentOpenInteractionService.js', () => ({
  requestDocumentOpenPathByInteraction: fileManagerPanelState.openDecisionOpenDocument,
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: fileManagerPanelState.channelSend,
  },
}))

vi.mock('@/util/file-manager/fileManagerOpenDecisionController.js', () => ({
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
    fileManagerPanelState.store.config.language = 'zh-CN'
    fileManagerPanelState.store.config.fileManagerSort = {
      field: 'type',
      direction: 'asc',
    }
    fileManagerPanelState.requestFileManagerDirectoryState.mockReset()
    fileManagerPanelState.requestFileManagerOpenDirectory.mockReset()
    fileManagerPanelState.requestFileManagerCreateFolder.mockReset()
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockReset()
    fileManagerPanelState.requestFileManagerSyncCurrentDirectoryOptions.mockReset()
    fileManagerPanelState.requestFileManagerPickDirectory.mockReset()
    fileManagerPanelState.openDecisionOpenDocument.mockReset()
    fileManagerPanelState.channelSend.mockReset()
    fileManagerPanelState.channelSend.mockResolvedValue({
      ok: true,
    })
    fileManagerPanelState.requestFileManagerSyncCurrentDirectoryOptions.mockResolvedValue({
      ok: true,
      synced: true,
    })
    fileManagerPanelState.modalConfirm.mockReset()
    fileManagerPanelState.messageWarning.mockReset()
    fileManagerPanelState.scrollIntoView.mockReset()
    fileManagerPanelState.registeredHandlerMap.clear()
    i18nState.t.mockClear()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: fileManagerPanelState.scrollIntoView,
    })
  })

  afterEach(async () => {
    while (mountedWrapperList.length > 0) {
      mountedWrapperList.pop()?.unmount()
    }
    await flushFileManagerPanel()
    vi.clearAllMocks()
  })

  it('draft 会话应显示空状态，正常文件会话应显示目录列表并保留当前文件激活态', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: null,
    })

    const draftWrapper = mount(FileManagerPanel)
    mountedWrapperList.push(draftWrapper)
    await flushFileManagerPanel()

    expect(draftWrapper.get('[data-testid="file-manager-empty-state"]').find('[data-testid="empty-stub"]').exists()).toBe(true)
    expect(draftWrapper.find('[data-testid="file-manager-empty-open-directory"]').exists()).toBe(false)
    expect(draftWrapper.get('[data-testid="file-manager-open-parent"]').attributes('disabled')).toBeDefined()

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
    expect(wrapper.get('.file-manager-panel__list').classes()).toContain('wj-scrollbar')
  })

  it('工具栏应渲染上一级按钮，并在可用时打开父目录', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs/project',
      entryList: [
        { name: 'current.md', path: 'D:/docs/project/current.md', kind: 'markdown' },
      ],
    }))
    fileManagerPanelState.requestFileManagerOpenDirectory.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'project', path: 'D:/docs/project', kind: 'directory' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    const openParentButton = wrapper.get('[data-testid="file-manager-open-parent"]')
    expect(openParentButton.attributes('title')).toBe('translated:message.fileManagerOpenParentDirectory')
    expect(openParentButton.attributes('disabled')).toBeUndefined()

    await openParentButton.trigger('click')
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerOpenDirectory).toHaveBeenCalledWith({
      directoryPath: 'D:/docs',
    })
    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('docs')
  })

  it('根目录时上一级按钮应禁用', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/',
      entryList: [
        { name: 'docs', path: 'D:/docs', kind: 'directory' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-open-parent"]').attributes('disabled')).toBeDefined()
  })

  it('定位当前文件目录按钮在面板已切到其他目录后应可用，并能切回当前文件所在目录后滚动到当前文件', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: 'D:/docs/project/current.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs/project',
      entryList: [
        { name: 'current.md', path: 'D:/docs/project/current.md', kind: 'markdown' },
      ],
    }))
    fileManagerPanelState.requestFileManagerOpenDirectory
      .mockResolvedValueOnce(createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'project', path: 'D:/docs/project', kind: 'directory' },
        ],
      }))
      .mockResolvedValueOnce(createDirectoryState({
        directoryPath: 'D:/docs/project',
        entryList: [
          { name: 'current.md', path: 'D:/docs/project/current.md', kind: 'markdown' },
        ],
      }))

    const wrapper = mount(FileManagerPanel, {
      attachTo: document.body,
    })
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('[data-testid="file-manager-open-parent"]').trigger('click')
    await flushFileManagerPanel()

    const focusCurrentDirectoryButton = wrapper.get('[data-testid="file-manager-focus-current-file-directory"]')
    expect(focusCurrentDirectoryButton.attributes('title')).toBe('translated:message.fileManagerFocusCurrentFileDirectory')
    expect(focusCurrentDirectoryButton.attributes('disabled')).toBeUndefined()

    await focusCurrentDirectoryButton.trigger('click')
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerOpenDirectory).toHaveBeenNthCalledWith(1, {
      directoryPath: 'D:/docs',
    })
    expect(fileManagerPanelState.requestFileManagerOpenDirectory).toHaveBeenNthCalledWith(2, {
      directoryPath: 'D:/docs/project',
    })
    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('D:/docs/project')
    expect(fileManagerPanelState.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
    expect(fileManagerPanelState.scrollIntoView.mock.contexts.at(-1)).toBe(wrapper.get('[data-testid="file-manager-entry-current"]').element)
  })

  it('定位当前文件目录按钮在当前目录已命中时仍应可用，并滚动定位到当前文件', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: 'D:/docs/current.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel, {
      attachTo: document.body,
    })
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    const focusCurrentDirectoryButton = wrapper.get('[data-testid="file-manager-focus-current-file-directory"]')
    expect(focusCurrentDirectoryButton.attributes('disabled')).toBeUndefined()

    await focusCurrentDirectoryButton.trigger('click')
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerOpenDirectory).not.toHaveBeenCalled()
    expect(fileManagerPanelState.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
    expect(fileManagerPanelState.scrollIntoView.mock.contexts.at(-1)).toBe(wrapper.get('[data-testid="file-manager-entry-current"]').element)
  })

  it('定位当前文件目录按钮在草稿态应禁用', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: null,
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockReset()

    const draftWrapper = mount(FileManagerPanel)
    mountedWrapperList.push(draftWrapper)
    await flushFileManagerPanel()

    expect(draftWrapper.get('[data-testid="file-manager-focus-current-file-directory"]').attributes('disabled')).toBeDefined()
  })

  it('搜索过滤掉当前文件后，定位当前文件应先清空搜索再滚动到目标文件', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: 'D:/docs/current.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'assets', path: 'D:/docs/assets', kind: 'directory' },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel, {
      attachTo: document.body,
    })
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('.file-manager-panel__search-input input').setValue('assets')
    await flushFileManagerPanel()

    expect(wrapper.find('[data-testid="file-manager-entry-current"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="file-manager-search-clear"]').exists()).toBe(true)

    await wrapper.get('[data-testid="file-manager-focus-current-file-directory"]').trigger('click')
    await flushFileManagerPanel()

    expect(wrapper.get('.file-manager-panel__search-input input').element.value).toBe('')
    expect(wrapper.find('[data-testid="file-manager-search-clear"]').exists()).toBe(false)
    expect(fileManagerPanelState.requestFileManagerOpenDirectory).not.toHaveBeenCalled()
    expect(fileManagerPanelState.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
    expect(fileManagerPanelState.scrollIntoView.mock.contexts.at(-1)).toBe(wrapper.get('[data-testid="file-manager-entry-current"]').element)
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
    expect(wrapper.get('.file-manager-panel__empty-description').classes()).toContain('color-gray-500')
    expect(wrapper.find('[data-testid="file-manager-empty-open-directory"]').exists()).toBe(false)
  })

  it('recent-missing 父目录不存在时应显示无描述空组件，且不再渲染正文动作入口', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      isRecentMissing: true,
      recentMissingPath: 'D:/docs/missing.md',
    })
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(null)

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toBe('')
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').find('[data-testid="empty-stub"]').exists()).toBe(true)
    expect(wrapper.find('.file-manager-panel__empty-message').exists()).toBe(false)
    expect(wrapper.find('[data-testid="file-manager-empty-open-directory"]').exists()).toBe(false)
  })

  it('recent-missing 父目录不存在时，即使主进程返回 directoryPath:null 的空状态对象，也必须保持无描述空组件', async () => {
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
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').find('[data-testid="empty-stub"]').exists()).toBe(true)
    expect(wrapper.find('.file-manager-panel__empty-message').exists()).toBe(false)
    expect(wrapper.find('[data-testid="file-manager-empty-open-directory"]').exists()).toBe(false)
  })

  it('文件管理栏工具区应显示当前目录完整路径字符串', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs/project',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toBe('D:/docs/project')
  })

  it('目录、Markdown、图片、视频及其他常见文件应显示对应图标，长文件名保持单行省略', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      entryList: [
        { name: 'assets', path: 'D:/docs/assets', kind: 'directory' },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
        { name: 'cover.png', path: 'D:/docs/cover.png', kind: 'other' },
        { name: 'trailer.mp4', path: 'D:/docs/trailer.mp4', kind: 'other' },
        { name: 'report.pdf', path: 'D:/docs/report.pdf', kind: 'other' },
        { name: 'proposal.docx', path: 'D:/docs/proposal.docx', kind: 'other' },
        { name: 'sheet.xlsx', path: 'D:/docs/sheet.xlsx', kind: 'other' },
        { name: 'archive.zip', path: 'D:/docs/archive.zip', kind: 'other' },
        { name: 'audio.mp3', path: 'D:/docs/audio.mp3', kind: 'other' },
        { name: 'very-long-attachment-name.unknown', path: 'D:/docs/very-long-attachment-name.unknown', kind: 'other' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(findFileManagerEntryByName(wrapper, 'assets').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:folder')
    expect(findFileManagerEntryByName(wrapper, 'current.md').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:markdown')
    expect(findFileManagerEntryByName(wrapper, 'cover.png').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:photo')
    expect(findFileManagerEntryByName(wrapper, 'trailer.mp4').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:movie')
    expect(findFileManagerEntryByName(wrapper, 'report.pdf').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:file-type-pdf')
    expect(findFileManagerEntryByName(wrapper, 'proposal.docx').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:file-word')
    expect(findFileManagerEntryByName(wrapper, 'sheet.xlsx').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:table')
    expect(findFileManagerEntryByName(wrapper, 'archive.zip').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:zip')
    expect(findFileManagerEntryByName(wrapper, 'audio.mp3').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:music')
    expect(findFileManagerEntryByName(wrapper, 'very-long-attachment-name.unknown').get('.file-manager-panel__entry-icon').classes()).toContain('i-tabler:file')
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

  it('点击其他 Markdown 时，必须经由 HomeView 宿主的统一打开交互 service', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      entryList: [
        { name: 'next.md', path: 'D:/docs/next.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('.file-manager-panel__entry').trigger('click')
    await flushFileManagerPanel()

    expect(fileManagerPanelState.openDecisionOpenDocument).toHaveBeenCalledWith('D:/docs/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
    })
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

  it('工具区应改为一个新建下拉和一个排序下拉，并在 setupState 暴露对应菜单项', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.find('[data-testid="file-manager-create-folder"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="file-manager-create-markdown"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="file-manager-create-entry"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="file-manager-sort-entry"]').exists()).toBe(true)
    expect(resolveSetupStateBinding(wrapper.vm.$.setupState.createMenuList).map(item => item.label)).toEqual([
      'translated:message.fileManagerCreateFolder',
      'translated:message.fileManagerCreateMarkdown',
    ])
    expect(resolveSetupStateBinding(wrapper.vm.$.setupState.sortMenuList).map(item => extractVNodeText(item.label))).toEqual([
      'translated:message.fileManagerSortTypeAsc',
      'translated:message.fileManagerSortTypeDesc',
      'translated:message.fileManagerSortNameAsc',
      'translated:message.fileManagerSortNameDesc',
      'translated:message.fileManagerSortModifiedTimeAsc',
      'translated:message.fileManagerSortModifiedTimeDesc',
    ])
  })

  it('文件管理栏的新建下拉应使用 click 触发，排序下拉应使用 hover 触发并以打勾形式标记当前规则', async () => {
    fileManagerPanelState.store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    const iconButtonList = wrapper.findAllComponents(IconButton)
    const createEntryButton = iconButtonList.find(component => component.attributes('data-testid') === 'file-manager-create-entry')
    const sortEntryButton = iconButtonList.find(component => component.attributes('data-testid') === 'file-manager-sort-entry')

    expect(createEntryButton?.props('menuTrigger')).toEqual(['click'])
    expect(sortEntryButton?.props('menuTrigger')).toEqual(['hover'])
    expect(sortEntryButton?.props('menuSelectedKeys')).toEqual([])

    const sortMenuList = resolveSetupStateBinding(wrapper.vm.$.setupState.sortMenuList)
    const selectedItem = sortMenuList.find(item => item.key === 'modifiedTime-desc')
    const unselectedItem = sortMenuList.find(item => item.key === 'name-asc')

    expect(containsVNodeClass(selectedItem.label, 'i-tabler:check')).toBe(true)
    expect(containsVNodeClass(selectedItem.label, 'mr-1')).toBe(true)
    expect(containsVNodeClass(unselectedItem.label, 'i-tabler:check')).toBe(false)
    expect(containsVNodeClass(unselectedItem.label, 'mr-4')).toBe(true)
  })

  it('点击工具区新建菜单里的文件夹动作后，应走创建文件夹链路', async () => {
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

    const createFolderActionPromise = resolveSetupStateBinding(wrapper.vm.$.setupState.createMenuList)[0].action()
    folderDialogConfig.content.props['onUpdate:value']('assets')
    await folderDialogConfig.onOk()
    await createFolderActionPromise
    await flushFileManagerPanel()

    expect(folderDialogConfig.title).toBe('translated:message.fileManagerCreateFolder')
    expect(fileManagerPanelState.requestFileManagerCreateFolder).toHaveBeenCalledWith({
      name: 'assets',
    })
    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('docs')
  })

  it('点击工具区新建菜单里的 Markdown 动作后，应展示 .md 后缀输入框并仅刷新列表', async () => {
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

    const createMarkdownActionPromise = resolveSetupStateBinding(wrapper.vm.$.setupState.createMenuList)[1].action()
    const markdownAddonAfterNode = markdownDialogConfig.content.children.addonAfter()

    expect(extractVNodeText(markdownAddonAfterNode)).toBe('.md')
    expect(markdownAddonAfterNode.props.style.color).toBe('var(--wj-markdown-text-primary)')

    markdownDialogConfig.content.props['onUpdate:value']('draft-note.md')
    await markdownDialogConfig.onOk()
    await createMarkdownActionPromise
    await flushFileManagerPanel()

    expect(markdownDialogConfig.title).toBe('translated:message.fileManagerCreateMarkdown')
    expect(fileManagerPanelState.requestFileManagerCreateMarkdown).toHaveBeenCalledWith({
      name: 'draft-note.md',
    })
    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="file-manager-entry-name"]').map(node => node.text())).toContain('draft-note.md')
  })

  it('切换语言后 createMenuList 和 sortMenuList 标签应立即更新', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(resolveSetupStateBinding(wrapper.vm.$.setupState.createMenuList).map(item => item.label)).toEqual([
      'translated:message.fileManagerCreateFolder',
      'translated:message.fileManagerCreateMarkdown',
    ])
    expect(resolveSetupStateBinding(wrapper.vm.$.setupState.sortMenuList).map(item => extractVNodeText(item.label))).toEqual([
      'translated:message.fileManagerSortTypeAsc',
      'translated:message.fileManagerSortTypeDesc',
      'translated:message.fileManagerSortNameAsc',
      'translated:message.fileManagerSortNameDesc',
      'translated:message.fileManagerSortModifiedTimeAsc',
      'translated:message.fileManagerSortModifiedTimeDesc',
    ])

    fileManagerPanelState.store.config.language = 'en-US'
    await flushFileManagerPanel()

    expect(resolveSetupStateBinding(wrapper.vm.$.setupState.createMenuList).map(item => item.label)).toEqual([
      'localized:message.fileManagerCreateFolder',
      'localized:message.fileManagerCreateMarkdown',
    ])
    expect(resolveSetupStateBinding(wrapper.vm.$.setupState.sortMenuList).map(item => extractVNodeText(item.label))).toEqual([
      'localized:message.fileManagerSortTypeAsc',
      'localized:message.fileManagerSortTypeDesc',
      'localized:message.fileManagerSortNameAsc',
      'localized:message.fileManagerSortNameDesc',
      'localized:message.fileManagerSortModifiedTimeAsc',
      'localized:message.fileManagerSortModifiedTimeDesc',
    ])
  })

  it('draft 空状态应通过工具栏选择目录，并在选择成功后切换到该目录', async () => {
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
    expect(wrapper.find('[data-testid="file-manager-empty-open-directory"]').exists()).toBe(false)

    await wrapper.get('[data-testid="file-manager-open-directory"]').trigger('click')
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerPickDirectory).toHaveBeenCalledTimes(1)
    expect(fileManagerPanelState.requestFileManagerOpenDirectory).toHaveBeenCalledWith({
      directoryPath: 'D:/workspace',
    })
    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('workspace')
  })

  it('草稿空状态正文应改为无描述空组件，工具区标题仍使用 t(emptyMessageKey)', async () => {
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: null,
    })

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-breadcrumb"]').text()).toContain('translated:message.fileManagerSelectDirectory')
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').find('[data-testid="empty-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').text()).toBe('')
  })

  it('搜索无结果时应显示搜索空状态文案，而不是目录空状态文案', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      entryList: [
        { name: 'draft-note.md', path: 'D:/docs/draft-note.md', kind: 'markdown' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('.file-manager-panel__search-input input').setValue('missing-keyword')
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-empty-state"]').text()).toContain('translated:message.fileManagerNoSearchResults')
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').text()).not.toContain('translated:message.fileManagerDirectoryEmpty')
    expect(wrapper.get('.file-manager-panel__empty-description').classes()).toContain('color-gray-500')
  })

  it('搜索框输入后应显示清空入口，清空后恢复完整列表', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      entryList: [
        { name: 'draft-note.md', path: 'D:/docs/draft-note.md', kind: 'markdown' },
        { name: 'assets', path: 'D:/docs/assets', kind: 'directory' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    await wrapper.get('.file-manager-panel__search-input input').setValue('missing-keyword')
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-empty-state"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="file-manager-search-clear"]').exists()).toBe(true)

    await wrapper.get('[data-testid="file-manager-search-clear"]').trigger('click')
    await flushFileManagerPanel()

    expect(wrapper.find('[data-testid="file-manager-empty-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="file-manager-search-clear"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="file-manager-entry-name"]').map(node => node.text()).sort()).toEqual([
      'draft-note.md',
      'assets',
    ].sort())
  })

  it('中英文文案应补齐文件管理栏真实使用到的 key', async () => {
    const zhCN = (await import('@/i18n/zhCN.js')).default
    const enUS = (await import('@/i18n/enUS.js')).default

    expect(zhCN.message.fileManagerSelectDirectory).toBeTruthy()
    expect(zhCN.message.fileManagerDirectoryEmpty).toBeTruthy()
    expect(zhCN.message.fileManagerOpenParentDirectory).toBeTruthy()
    expect(zhCN.message.fileManagerFocusCurrentFileDirectory).toBeTruthy()
    expect(zhCN.message.fileManagerCreateFolder).toBeTruthy()
    expect(zhCN.message.fileManagerCreateMarkdown).toBeTruthy()
    expect(zhCN.message.fileManagerCreateEntry).toBeTruthy()
    expect(zhCN.message.fileManagerSort).toBeTruthy()
    expect(zhCN.message.fileManagerSortNameAsc).toBeTruthy()
    expect(zhCN.message.fileManagerSortNameDesc).toBeTruthy()
    expect(zhCN.message.fileManagerSortModifiedTimeAsc).toBeTruthy()
    expect(zhCN.message.fileManagerSortModifiedTimeDesc).toBeTruthy()
    expect(zhCN.message.fileManagerSortTypeAsc).toBeTruthy()
    expect(zhCN.message.fileManagerSortTypeDesc).toBeTruthy()
    expect(zhCN.message.fileManagerFolderNameRequired).toBeTruthy()
    expect(zhCN.message.fileManagerMarkdownNameRequired).toBeTruthy()
    expect(zhCN.message.fileManagerOpenDirectoryFailed).toBeTruthy()

    expect(enUS.message.fileManagerSelectDirectory).toBeTruthy()
    expect(enUS.message.fileManagerDirectoryEmpty).toBeTruthy()
    expect(enUS.message.fileManagerOpenParentDirectory).toBeTruthy()
    expect(enUS.message.fileManagerFocusCurrentFileDirectory).toBeTruthy()
    expect(enUS.message.fileManagerCreateFolder).toBeTruthy()
    expect(enUS.message.fileManagerCreateMarkdown).toBeTruthy()
    expect(enUS.message.fileManagerCreateEntry).toBeTruthy()
    expect(enUS.message.fileManagerSort).toBeTruthy()
    expect(enUS.message.fileManagerSortNameAsc).toBeTruthy()
    expect(enUS.message.fileManagerSortNameDesc).toBeTruthy()
    expect(enUS.message.fileManagerSortModifiedTimeAsc).toBeTruthy()
    expect(enUS.message.fileManagerSortModifiedTimeDesc).toBeTruthy()
    expect(enUS.message.fileManagerSortTypeAsc).toBeTruthy()
    expect(enUS.message.fileManagerSortTypeDesc).toBeTruthy()
    expect(enUS.message.fileManagerFolderNameRequired).toBeTruthy()
    expect(enUS.message.fileManagerMarkdownNameRequired).toBeTruthy()
    expect(enUS.message.fileManagerOpenDirectoryFailed).toBeTruthy()
  })

  it('文件管理栏样式应只让当前项使用蓝色文字高亮，而不是把全部非激活项降级成次级色', async () => {
    const css = await loadFileManagerPanelCompiledStyle()
    const entryDeclarations = extractCssRuleDeclarations(css, '.file-manager-panel__entry')
    const activeDeclarations = extractCssRuleDeclarations(css, '.file-manager-panel__entry.is-active')

    expect(entryDeclarations.get('color')).not.toBe('var(--wj-markdown-text-secondary)')
    expect(activeDeclarations.get('color')).toBe('#1677ff')
    expect(activeDeclarations.has('background')).toBe(false)
    expect(activeDeclarations.has('box-shadow')).toBe(false)
  })

  it('路径标题样式应使用纯 CSS 左侧省略，并为路径内容补充 LTR 顺序修正', async () => {
    const css = await loadFileManagerPanelCompiledStyle()
    const pathDeclarations = extractCssRuleDeclarations(css, '.file-manager-panel__path-text')
    const pathValueDeclarations = extractCssRuleDeclarations(css, '.file-manager-panel__path-value')

    expect(pathDeclarations.get('display')).toBe('block')
    expect(pathDeclarations.get('overflow')).toBe('hidden')
    expect(pathDeclarations.get('direction')).toBe('rtl')
    expect(pathDeclarations.get('text-align')).toBe('left')
    expect(pathDeclarations.get('text-overflow')).toBe('ellipsis')
    expect(pathDeclarations.get('white-space')).toBe('nowrap')
    expect(pathValueDeclarations.get('direction')).toBe('ltr')
    expect(pathValueDeclarations.get('unicode-bidi')).toBe('bidi-override')
  })

  it('文件名与路径文本样式应显式声明行高，避免下伸字母被裁切', async () => {
    const css = await loadFileManagerPanelCompiledStyle()
    const pathDeclarations = extractCssRuleDeclarations(css, '.file-manager-panel__path-text')
    const entryNameDeclarations = extractCssRuleDeclarations(css, '.file-manager-panel__entry-name')

    expect(pathDeclarations.get('line-height')).toBeTruthy()
    expect(entryNameDeclarations.get('line-height')).toBeTruthy()
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
    fileManagerPanelState.store.config.fileManagerSort = {
      field: 'type',
      direction: 'asc',
    }
    fileManagerPanelState.requestFileManagerDirectoryState.mockReset()
    fileManagerPanelState.requestFileManagerOpenDirectory.mockReset()
    fileManagerPanelState.requestFileManagerCreateFolder.mockReset()
    fileManagerPanelState.requestFileManagerCreateMarkdown.mockReset()
    fileManagerPanelState.requestFileManagerPickDirectory.mockReset()
    fileManagerPanelState.openDecisionOpenDocument.mockReset()
    fileManagerPanelState.modalConfirm.mockReset()
    fileManagerPanelState.messageWarning.mockReset()
    fileManagerPanelState.registeredHandlerMap.clear()
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

  it('fileManagerSort 变化后应立即重排当前 entryList，且不能重新请求目录', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'voice.mp3', path: 'D:/docs/voice.mp3', kind: 'file' },
        { name: 'cover.png', path: 'D:/docs/cover.png', kind: 'file' },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file' },
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

    expect(controller.entryList.value.map(item => item.name)).toEqual([
      'current.md',
      'cover.png',
      'voice.mp3',
    ])
    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(1)

    fileManagerPanelState.store.config.fileManagerSort.field = 'name'
    fileManagerPanelState.store.config.fileManagerSort.direction = 'desc'
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(1)
    expect(controller.entryList.value.map(item => item.name)).toEqual([
      'voice.mp3',
      'current.md',
      'cover.png',
    ])

    scope.stop()
  })

  it('切换到 modifiedTime 排序且当前缓存缺少修改时间时，必须补发当前目录请求', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerDirectoryState
      .mockResolvedValueOnce(createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'older.md', path: 'D:/docs/older.md', kind: 'file' },
          { name: 'latest.md', path: 'D:/docs/latest.md', kind: 'file' },
        ],
      }))
      .mockResolvedValueOnce(createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'older.md', path: 'D:/docs/older.md', kind: 'file', modifiedTimeMs: 10 },
          { name: 'latest.md', path: 'D:/docs/latest.md', kind: 'file', modifiedTimeMs: 50 },
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

    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(1)

    fileManagerPanelState.store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(2)
    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenNthCalledWith(2, {
      directoryPath: 'D:/docs',
      includeModifiedTime: true,
    })
    expect(controller.entryList.value.map(item => item.name)).toEqual([
      'latest.md',
      'older.md',
    ])

    scope.stop()
  })

  it('空目录收到目录变更事件后，再切到 modifiedTime 排序时不应额外补发目录请求', async () => {
    const { FILE_MANAGER_DIRECTORY_CHANGED_EVENT } = await import('@/util/file-manager/fileManagerEventUtil.js')
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValueOnce(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file' },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.findAll('[data-testid="file-manager-entry-name"]').map(node => node.text())).toEqual([
      'current.md',
    ])
    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(1)

    const changedHandler = fileManagerPanelState.registeredHandlerMap.get(FILE_MANAGER_DIRECTORY_CHANGED_EVENT)
    changedHandler(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [],
    }))
    await flushFileManagerPanel()

    expect(wrapper.get('[data-testid="file-manager-empty-state"]').text()).toContain('translated:message.fileManagerDirectoryEmpty')
    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(1)

    fileManagerPanelState.store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    await flushFileManagerPanel()

    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(1)
    expect(fileManagerPanelState.requestFileManagerSyncCurrentDirectoryOptions).toHaveBeenCalledWith({
      includeModifiedTime: true,
    })
    expect(wrapper.get('[data-testid="file-manager-empty-state"]').exists()).toBe(true)
  })

  it('切换到 modifiedTime 排序且当前缓存缺少修改时间时，请求返回前应保留上一版列表顺序，不能先闪到名称排序', async () => {
    const deferredDirectoryState = createDeferred()
    fileManagerPanelState.requestFileManagerDirectoryState
      .mockResolvedValueOnce(createDirectoryState({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'voice.mp3', path: 'D:/docs/voice.mp3', kind: 'file' },
          { name: 'cover.png', path: 'D:/docs/cover.png', kind: 'file' },
          { name: 'current.md', path: 'D:/docs/current.md', kind: 'file' },
        ],
      }))
      .mockImplementationOnce(() => deferredDirectoryState.promise)

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.findAll('[data-testid="file-manager-entry-name"]').map(node => node.text())).toEqual([
      'current.md',
      'cover.png',
      'voice.mp3',
    ])

    fileManagerPanelState.store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    await Promise.resolve()
    await nextTick()

    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(2)
    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenNthCalledWith(2, {
      directoryPath: 'D:/docs',
      includeModifiedTime: true,
    })
    expect(wrapper.findAll('[data-testid="file-manager-entry-name"]').map(node => node.text())).toEqual([
      'current.md',
      'cover.png',
      'voice.mp3',
    ])

    deferredDirectoryState.resolve(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'voice.mp3', path: 'D:/docs/voice.mp3', kind: 'file', modifiedTimeMs: 50 },
        { name: 'cover.png', path: 'D:/docs/cover.png', kind: 'file', modifiedTimeMs: 30 },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file', modifiedTimeMs: 10 },
      ],
    }))
    await flushFileManagerPanel()

    expect(wrapper.findAll('[data-testid="file-manager-entry-name"]').map(node => node.text())).toEqual([
      'voice.mp3',
      'cover.png',
      'current.md',
    ])
  })

  it('执行 modifiedTime desc 排序菜单动作后，应立即重排当前列表并写入配置', async () => {
    fileManagerPanelState.requestFileManagerDirectoryState.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'assets', path: 'D:/docs/assets', kind: 'directory', modifiedTimeMs: 5 },
        { name: 'older.md', path: 'D:/docs/older.md', kind: 'file', modifiedTimeMs: 10 },
        { name: 'cover.png', path: 'D:/docs/cover.png', kind: 'file', modifiedTimeMs: 30 },
        { name: 'latest.md', path: 'D:/docs/latest.md', kind: 'file', modifiedTimeMs: 50 },
      ],
    }))

    const wrapper = mount(FileManagerPanel)
    mountedWrapperList.push(wrapper)
    await flushFileManagerPanel()

    expect(wrapper.findAll('[data-testid="file-manager-entry-name"]').map(node => node.text())).toEqual([
      'assets',
      'latest.md',
      'older.md',
      'cover.png',
    ])

    const modifiedTimeDescMenuItem = resolveSetupStateBinding(wrapper.vm.$.setupState.sortMenuList).find(item => item.key === 'modifiedTime-desc')
    await modifiedTimeDescMenuItem.action()
    await flushFileManagerPanel()

    expect(fileManagerPanelState.channelSend).toHaveBeenCalledWith({
      event: 'user-update-config',
      data: expect.objectContaining({
        fileManagerSort: {
          field: 'modifiedTime',
          direction: 'desc',
        },
      }),
    })
    expect(fileManagerPanelState.store.config.fileManagerSort).toEqual({
      field: 'modifiedTime',
      direction: 'desc',
    })
    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenCalledTimes(2)
    expect(fileManagerPanelState.requestFileManagerDirectoryState).toHaveBeenNthCalledWith(2, {
      directoryPath: 'D:/docs',
      includeModifiedTime: true,
    })
    expect(wrapper.findAll('[data-testid="file-manager-entry-name"]').map(node => node.text())).toEqual([
      'assets',
      'latest.md',
      'cover.png',
      'older.md',
    ])
  })

  it('排序配置写入 IPC 前应去掉响应式代理，避免 structured clone 失败', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const scope = effectScope()
    let controller = null
    const sendCommand = vi.fn(async (payload) => {
      structuredClone(payload.data)
      return { ok: true }
    })

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
        sendCommand,
      })
    })

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file', modifiedTimeMs: 10 },
      ],
    }))

    await expect(controller.updateFileManagerSortConfig({
      field: 'name',
      direction: 'desc',
    })).resolves.toEqual({ ok: true })

    expect(sendCommand).toHaveBeenCalledTimes(1)
    expect(fileManagerPanelState.messageWarning).not.toHaveBeenCalled()
    expect(fileManagerPanelState.store.config.fileManagerSort).toEqual({
      field: 'name',
      direction: 'desc',
    })

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

  it('canOpenParentDirectory 仅在当前目录存在可打开的上一级时才应启用', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: fileManagerPanelState.store,
        t: value => value,
      })
    })

    expect(controller.canOpenParentDirectory.value).toBe(false)

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs/project',
      entryList: [],
    }))
    expect(controller.canOpenParentDirectory.value).toBe(true)

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/',
      entryList: [],
    }))
    expect(controller.canOpenParentDirectory.value).toBe(false)

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: '//server/share',
      entryList: [],
    }))
    expect(controller.canOpenParentDirectory.value).toBe(false)

    scope.stop()
  })

  it('canFocusCurrentDocumentDirectory 只要存在当前文档目录就应启用，已在该目录时也应返回 ready 结果', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')

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

    expect(controller.canFocusCurrentDocumentDirectory.value).toBe(true)

    const readyResult = await controller.focusCurrentDocumentDirectory()

    expect(readyResult).toEqual({
      ok: true,
      reason: 'current-document-directory-ready',
      directoryPath: 'D:/docs',
    })
    expect(fileManagerPanelState.requestFileManagerOpenDirectory).not.toHaveBeenCalled()

    fileManagerPanelState.requestFileManagerOpenDirectory.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/other',
      entryList: [
        { name: 'current.md', path: 'D:/other/current.md', kind: 'markdown' },
      ],
    }))
    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [],
    }))
    fileManagerPanelState.store.documentSessionSnapshot = createDocumentSnapshot({
      path: 'D:/other/current.md',
    })
    await flushFileManagerPanel()

    expect(controller.canFocusCurrentDocumentDirectory.value).toBe(true)
    await controller.focusCurrentDocumentDirectory()

    expect(fileManagerPanelState.requestFileManagerOpenDirectory).toHaveBeenCalledWith({
      directoryPath: 'D:/other',
    })

    scope.stop()
  })

  it('openParentDirectory 在普通目录下应打开上一级，其余场景必须返回 noop 且不发起请求', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerOpenDirectory.mockResolvedValue(createDirectoryState({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'project', path: 'D:/docs/project', kind: 'directory' },
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

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/docs/project',
      entryList: [],
    }))

    const openResult = await controller.openParentDirectory()

    expect(fileManagerPanelState.requestFileManagerOpenDirectory).toHaveBeenCalledWith({
      directoryPath: 'D:/docs',
    })
    expect(openResult).toEqual(expect.objectContaining({
      directoryPath: 'D:/docs',
    }))
    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.path)).toEqual(['D:/docs/project'])

    fileManagerPanelState.requestFileManagerOpenDirectory.mockClear()

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: 'D:/',
      entryList: [],
    }))
    expect(await controller.openParentDirectory()).toEqual({
      ok: true,
      reason: 'noop-parent-directory',
    })
    expect(fileManagerPanelState.requestFileManagerOpenDirectory).not.toHaveBeenCalled()

    controller.applyDirectoryState(createDirectoryState({
      directoryPath: '//server/share',
      entryList: [],
    }))
    expect(await controller.openParentDirectory()).toEqual({
      ok: true,
      reason: 'noop-parent-directory',
    })

    controller.directoryState.value = createDirectoryState({
      directoryPath: null,
      entryList: [],
      emptyMessageKey: 'message.fileManagerSelectDirectory',
    })
    expect(await controller.openParentDirectory()).toEqual({
      ok: true,
      reason: 'noop-parent-directory',
    })
    expect(fileManagerPanelState.requestFileManagerOpenDirectory).not.toHaveBeenCalled()

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

  it('createFolder 收到同名已存在失败时，应继续复用现有提示链路并保留当前目录状态', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    fileManagerPanelState.requestFileManagerCreateFolder.mockResolvedValue({
      ok: false,
      reason: 'file-manager-entry-already-exists',
      path: 'D:/docs/assets',
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
      reason: 'file-manager-entry-already-exists',
      path: 'D:/docs/assets',
    })
    expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerEntryAlreadyExists')
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

  it('新建 Markdown 成功后应自动补齐 .md 后缀、刷新目录状态且不触发打开决策', async () => {
    const { createFileManagerPanelController } = await import('@/util/file-manager/fileManagerPanelController.js')
    const openNameInputModal = vi.fn().mockResolvedValue('draft-note')
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

    expect(fileManagerPanelState.requestFileManagerCreateMarkdown).toHaveBeenCalledWith({
      name: 'draft-note.md',
    })
    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()
    expect(controller.entryList.value.map(item => item.name)).toContain('draft-note.md')

    scope.stop()
  })

  it('createMarkdown 在未传名称时应先请求名称，并对已包含 .md 的名称自动去重', async () => {
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
    expect(fileManagerPanelState.openDecisionOpenDocument).not.toHaveBeenCalled()

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
    const localStore = reactive({
      fileManagerPanelVisible: true,
      documentSessionSnapshot: createDocumentSnapshot(),
      config: {
        fileManagerSort: {
          field: 'type',
          direction: 'asc',
        },
      },
    })

    await flushFileManagerPanel()
    fileManagerPanelState.requestFileManagerDirectoryState.mockReset()
    fileManagerPanelState.requestFileManagerDirectoryState
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => latestRequest.promise)

    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store: localStore,
        t: value => value,
      })
    })

    await flushFileManagerPanel()

    localStore.documentSessionSnapshot = createDocumentSnapshot({
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
