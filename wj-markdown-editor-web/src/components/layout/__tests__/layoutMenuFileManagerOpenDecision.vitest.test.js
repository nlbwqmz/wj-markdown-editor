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
const translationMap = {
  'topMenu.file.name': '文件',
  'topMenu.file.children.recentFiles.name': '最近',
  'topMenu.file.children.recentFiles.noHistory': '暂无最近历史',
  'topMenu.view.name': '视图',
  'topMenu.view.children.switchView': '切换',
  'topMenu.view.children.enterFullScreen': '进入全屏',
  'topMenu.view.children.exitFullScreen': '退出全屏',
  'topMenu.view.children.showFileManager': '显示文件管理栏',
  'topMenu.view.children.hideFileManager': '隐藏文件管理栏',
}

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
    t: key => translationMap[key] ?? key,
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

    const recentMenu = findMenuItemByLabel(getMenuChildren(wrapper, 0), '最近')
    const recentItem = findMenuItemByLabel(recentMenu.children, 'history.md')

    await recentItem.click()

    expect(mocked.openDecisionOpenDocument).toHaveBeenCalledWith('D:/docs/history.md', expect.objectContaining({
      currentPath: 'D:/docs/current.md',
      isDirty: true,
    }))
    expect(mocked.recentFileNotExists).toHaveBeenCalledWith('D:/docs/history.md')
    expect(mocked.requestDocumentOpenPath).not.toHaveBeenCalled()
  })

  it('最近历史经统一打开决策后，控制器返回兼容 false 时仍应触发 recentFileNotExists', async () => {
    store.recentList = [{
      path: 'D:/docs/missing.md',
      name: 'missing.md',
    }]
    mocked.openDecisionOpenDocument.mockResolvedValue(false)

    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const recentMenu = findMenuItemByLabel(getMenuChildren(wrapper, 0), '最近')
    const recentItem = findMenuItemByLabel(recentMenu.children, 'missing.md')

    await recentItem.click()

    expect(mocked.recentFileNotExists).toHaveBeenCalledWith('D:/docs/missing.md')
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

    expect(initialLabel).toBe('隐藏文件管理栏')

    await initialToggleItem.click()

    expect(store.setFileManagerPanelVisible).toHaveBeenCalledWith(false)

    await nextTick()

    const nextToggleItem = getMenuChildren(wrapper, 1)[2]
    const nextLabel = extractTextFromNode(nextToggleItem.label)

    expect(nextLabel).toBe('显示文件管理栏')

    await nextToggleItem.click()

    expect(store.setFileManagerPanelVisible).toHaveBeenLastCalledWith(true)
  })

  it('中英文文案应补齐文件管理栏显示与隐藏的运行时 key', async () => {
    const zhCN = (await import('@/i18n/zhCN.js')).default
    const enUS = (await import('@/i18n/enUS.js')).default

    expect(zhCN.topMenu.view.children.showFileManager).toBe('显示文件管理栏')
    expect(zhCN.topMenu.view.children.hideFileManager).toBe('隐藏文件管理栏')
    expect(enUS.topMenu.view.children.showFileManager).toBe('Show file manager')
    expect(enUS.topMenu.view.children.hideFileManager).toBe('Hide file manager')
    expect(zhCN.message.onlyMarkdownFilesCanBeOpened).toBe('只能打开 Markdown（.md / .markdown）文件。')
    expect(enUS.message.onlyMarkdownFilesCanBeOpened).toBe('Only Markdown (.md / .markdown) files can be opened.')
    expect(zhCN.message.fileAlreadyOpenedInOtherWindow).toBe('目标文件已在其他窗口打开，已为你切换到对应窗口。')
    expect(enUS.message.fileAlreadyOpenedInOtherWindow).toBe('The target file is already open in another window. Switched to that window for you.')
  })
})
