import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import LayoutMenu from '../LayoutMenu.vue'

const mocked = vi.hoisted(() => ({
  channelSend: vi.fn(),
  shortcutKeyHandler: vi.fn(),
  requestDocumentOpenPath: vi.fn(),
  requestRecentClear: vi.fn(),
  openDecisionOpenDocument: vi.fn(),
  openDecisionFactory: vi.fn(),
  recentFileNotExists: vi.fn(),
}))

const store = reactive({
  isFullScreen: false,
  fileManagerPanelVisible: true,
  recentList: [],
  documentSessionSnapshot: {
    dirty: false,
    displayPath: 'D:/docs/current.md',
    resourceContext: {
      documentPath: 'D:/docs/current.md',
    },
  },
  config: {
    language: 'zh-CN',
    shortcutKeyList: [
      {
        id: 'switchView',
        keymap: 'Ctrl+l',
        enabled: true,
      },
      {
        id: 'toggleFullScreen',
        keymap: 'F11',
        enabled: true,
      },
    ],
  },
  setFileManagerPanelVisible: vi.fn(),
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: key => key,
  }),
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore: () => store,
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: mocked.channelSend,
  },
}))

vi.mock('@/util/commonUtil.js', () => ({
  default: {
    createId: vi.fn(() => `mock-id-${Math.random()}`),
    createLabel: (label, shortcuts) => ({
      children: [label, shortcuts],
    }),
    createRecentLabel: (path, name) => ({
      children: [path, name],
    }),
    recentFileNotExists: mocked.recentFileNotExists,
  },
}))

vi.mock('@/util/fullScreenActionUtil.js', () => ({
  default: vi.fn(),
}))

vi.mock('@/util/shortcutKeyUtil.js', () => ({
  default: {
    getWebShortcutKeyHandler: mocked.shortcutKeyHandler,
  },
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentOpenPath: mocked.requestDocumentOpenPath,
  requestRecentClear: mocked.requestRecentClear,
  isDocumentOpenMissingResult: result => result === false || result?.reason === 'recent-missing' || result?.reason === 'open-target-missing',
}))

vi.mock('@/util/file-manager/fileManagerOpenDecisionController.js', () => ({
  createFileManagerOpenDecisionController: mocked.openDecisionFactory,
  resolveDocumentOpenCurrentPath(snapshot) {
    if (snapshot?.isRecentMissing === true) {
      return null
    }

    return snapshot?.resourceContext?.documentPath || snapshot?.displayPath || null
  },
}))

function extractTextFromNode(node) {
  if (Array.isArray(node)) {
    return node.map(item => extractTextFromNode(item)).join('')
  }

  if (typeof node === 'string') {
    return node
  }

  if (typeof node === 'number') {
    return String(node)
  }

  if (!node || typeof node !== 'object') {
    return ''
  }

  return extractTextFromNode(node.children)
}

function getSetupBinding(wrapper, key) {
  return wrapper.vm[key] ?? wrapper.vm.$.setupState[key]
}

function getMenuChildren(wrapper, menuIndex) {
  const menuList = getSetupBinding(wrapper, 'menuList')
  return menuList[menuIndex].children
}

function findMenuItemByLabel(children, matcher) {
  return children.find((item) => {
    const labelText = extractTextFromNode(item?.label)
    if (typeof matcher === 'string') {
      return labelText.includes(matcher)
    }

    return matcher(labelText, item)
  })
}

describe('layoutMenu 文件管理栏接线', () => {
  beforeEach(() => {
    store.isFullScreen = false
    store.fileManagerPanelVisible = true
    store.recentList = []
    store.documentSessionSnapshot = {
      dirty: false,
      displayPath: 'D:/docs/current.md',
      resourceContext: {
        documentPath: 'D:/docs/current.md',
      },
    }
    store.config.language = 'zh-CN'
    store.config.shortcutKeyList = [
      {
        id: 'switchView',
        keymap: 'Ctrl+l',
        enabled: true,
      },
      {
        id: 'toggleFullScreen',
        keymap: 'F11',
        enabled: true,
      },
    ]
    store.setFileManagerPanelVisible.mockReset()
    store.setFileManagerPanelVisible.mockImplementation((visible) => {
      store.fileManagerPanelVisible = visible
    })
    mocked.channelSend.mockReset()
    mocked.shortcutKeyHandler.mockReset()
    mocked.requestDocumentOpenPath.mockReset()
    mocked.requestRecentClear.mockReset()
    mocked.openDecisionOpenDocument.mockReset()
    mocked.openDecisionFactory.mockReset()
    mocked.recentFileNotExists.mockReset()
    mocked.openDecisionFactory.mockReturnValue({
      openDocument: mocked.openDecisionOpenDocument,
    })
  })

  it('最近历史点击应复用统一打开决策，并保留 recent-missing 提示能力', async () => {
    store.recentList = [{
      path: 'D:/docs/history.md',
      name: 'history.md',
    }]
    store.documentSessionSnapshot = {
      dirty: true,
      displayPath: 'D:/docs/current.md',
      resourceContext: {
        documentPath: 'D:/docs/current.md',
      },
    }
    mocked.openDecisionOpenDocument.mockResolvedValue({
      ok: false,
      reason: 'recent-missing',
    })

    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const recentMenu = findMenuItemByLabel(getMenuChildren(wrapper, 0), 'topMenu.file.children.recentFiles.name')
    const recentItem = findMenuItemByLabel(recentMenu.children, 'history.md')

    await recentItem.click()

    expect(mocked.openDecisionOpenDocument).toHaveBeenCalledWith('D:/docs/history.md', expect.objectContaining({
      currentPath: 'D:/docs/current.md',
      isDirty: true,
    }))
    expect(mocked.recentFileNotExists).toHaveBeenCalledWith('D:/docs/history.md')
    expect(mocked.requestDocumentOpenPath).not.toHaveBeenCalled()
  })

  it('视图菜单应提供文件管理栏开关，并在运行时状态切换后更新文案和动作', async () => {
    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const initialToggleItem = getMenuChildren(wrapper, 1)[2]
    const initialLabel = extractTextFromNode(initialToggleItem.label)

    expect(initialLabel).not.toBe('')

    await initialToggleItem.click()

    expect(store.setFileManagerPanelVisible).toHaveBeenCalledWith(false)

    await nextTick()

    const nextToggleItem = getMenuChildren(wrapper, 1)[2]
    const nextLabel = extractTextFromNode(nextToggleItem.label)

    expect(nextLabel).not.toBe(initialLabel)

    await nextToggleItem.click()

    expect(store.setFileManagerPanelVisible).toHaveBeenLastCalledWith(true)
  })
})
