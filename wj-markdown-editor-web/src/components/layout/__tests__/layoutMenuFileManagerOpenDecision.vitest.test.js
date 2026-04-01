import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import LayoutMenu from '../LayoutMenu.vue'

const mocked = vi.hoisted(() => ({
  channelSend: vi.fn(),
  shortcutKeyHandler: vi.fn(),
  requestDocumentOpenByDialogAndOpen: vi.fn(),
  requestDocumentOpenPathByInteraction: vi.fn(),
  requestRecentClear: vi.fn(),
  recentFileNotExists: vi.fn(),
}))
const translationMap = {
  'topMenu.file.name': '文件',
  'topMenu.file.children.openFile': '打开',
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
      {
        id: 'toggleFileManagerPanel',
        keymap: '',
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

vi.mock('@/util/document-session/documentOpenInteractionService.js', () => ({
  requestDocumentOpenByDialogAndOpen: mocked.requestDocumentOpenByDialogAndOpen,
  requestDocumentOpenPathByInteraction: mocked.requestDocumentOpenPathByInteraction,
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestRecentClear: mocked.requestRecentClear,
  isDocumentOpenMissingResult: result => result === false || result?.reason === 'recent-missing' || result?.reason === 'open-target-missing',
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
      {
        id: 'toggleFileManagerPanel',
        keymap: '',
        enabled: true,
      },
    ]
    store.setFileManagerPanelVisible.mockReset()
    store.setFileManagerPanelVisible.mockImplementation((visible) => {
      store.fileManagerPanelVisible = visible
    })
    mocked.channelSend.mockReset()
    mocked.shortcutKeyHandler.mockReset()
    mocked.requestDocumentOpenByDialogAndOpen.mockReset()
    mocked.requestDocumentOpenByDialogAndOpen.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
      path: null,
    })
    mocked.requestDocumentOpenPathByInteraction.mockReset()
    mocked.requestRecentClear.mockReset()
    mocked.recentFileNotExists.mockReset()
  })

  it('最近历史点击应复用统一打开决策，并保留 recent-missing 提示能力', async () => {
    store.recentList = [{
      path: 'D:/docs/history.md',
      name: 'history.md',
    }]
    mocked.requestDocumentOpenPathByInteraction.mockResolvedValue({
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

    expect(mocked.requestDocumentOpenPathByInteraction).toHaveBeenCalledWith('D:/docs/history.md', {
      entrySource: 'recent',
      trigger: 'user',
    })
    expect(mocked.recentFileNotExists).toHaveBeenCalledWith('D:/docs/history.md')
  })

  it('最近历史经统一宿主 service 后，控制器返回兼容 false 时仍应触发 recentFileNotExists', async () => {
    store.recentList = [{
      path: 'D:/docs/missing.md',
      name: 'missing.md',
    }]
    mocked.requestDocumentOpenPathByInteraction.mockResolvedValue(false)

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

    expect(mocked.requestDocumentOpenPathByInteraction).toHaveBeenCalledWith('D:/docs/missing.md', {
      entrySource: 'recent',
      trigger: 'user',
    })
    expect(mocked.recentFileNotExists).toHaveBeenCalledWith('D:/docs/missing.md')
  })

  it('文件菜单“打开”应直接走统一打开交互 service，并保留 menu-open 来源语义', async () => {
    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const openFileItem = findMenuItemByLabel(getMenuChildren(wrapper, 0), '打开')

    await openFileItem.click()

    expect(mocked.requestDocumentOpenByDialogAndOpen).toHaveBeenCalledWith({
      entrySource: 'menu-open',
      trigger: 'user',
    })
    expect(mocked.shortcutKeyHandler).not.toHaveBeenCalledWith('openFile', true)
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

  it('文件管理栏快捷键为空时，视图菜单项不应显示空快捷键占位', () => {
    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const toggleItemLabel = extractTextFromNode(getMenuChildren(wrapper, 1)[2].label)

    expect(toggleItemLabel).toBe('隐藏文件管理栏')
  })

  it('文件管理栏快捷键配置后，视图菜单项应显示当前快捷键', () => {
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
      {
        id: 'toggleFileManagerPanel',
        keymap: 'Ctrl+b',
        enabled: true,
      },
    ]

    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const toggleItemLabel = extractTextFromNode(getMenuChildren(wrapper, 1)[2].label)

    expect(toggleItemLabel).toContain('隐藏文件管理栏')
    expect(toggleItemLabel).toContain('Ctrl+b')
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
    expect(zhCN.message.fileManagerOpenModeTitle).toBeTruthy()
    expect(zhCN.message.fileManagerOpenModeTip).toBeTruthy()
    expect(zhCN.message.fileManagerOpenInCurrentWindow).toBeTruthy()
    expect(zhCN.message.fileManagerOpenInNewWindow).toBeTruthy()
    expect(zhCN.message.fileManagerSaveBeforeSwitchTitle).toBeTruthy()
    expect(zhCN.message.fileManagerSaveBeforeSwitch).toBeTruthy()
    expect(zhCN.message.fileManagerDiscardAndSwitch).toBeTruthy()
    expect(zhCN.message.fileManagerSaveBeforeSwitchFailed).toBeTruthy()
    expect(zhCN.message.fileManagerOpenCurrentWindowFailed).toBeTruthy()
    expect(enUS.message.fileManagerOpenModeTitle).toBeTruthy()
    expect(enUS.message.fileManagerOpenModeTip).toBeTruthy()
    expect(enUS.message.fileManagerOpenInCurrentWindow).toBeTruthy()
    expect(enUS.message.fileManagerOpenInNewWindow).toBeTruthy()
    expect(enUS.message.fileManagerSaveBeforeSwitchTitle).toBeTruthy()
    expect(enUS.message.fileManagerSaveBeforeSwitch).toBeTruthy()
    expect(enUS.message.fileManagerDiscardAndSwitch).toBeTruthy()
    expect(enUS.message.fileManagerSaveBeforeSwitchFailed).toBeTruthy()
    expect(enUS.message.fileManagerOpenCurrentWindowFailed).toBeTruthy()
  })
})
