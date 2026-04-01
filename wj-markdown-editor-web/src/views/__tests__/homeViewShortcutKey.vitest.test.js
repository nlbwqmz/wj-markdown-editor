import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HomeView from '../HomeView.vue'

const mocked = vi.hoisted(() => ({
  route: {
    name: 'setting',
  },
  shortcutKeyUtil: {
    isShortcutKey: vi.fn(),
    getShortcutKey: vi.fn(),
    getWebShortcutKeyHandler: vi.fn(),
  },
  store: {
    config: {
      shortcutKeyList: [],
    },
    fileManagerPanelVisible: false,
    documentSessionSnapshot: null,
  },
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore: () => mocked.store,
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRoute: () => mocked.route,
  }
})

vi.mock('vue-i18n', () => ({
  useI18n() {
    return {
      t(key) {
        return key
      },
    }
  },
}))

vi.mock('@/util/shortcutKeyUtil.js', () => ({
  default: mocked.shortcutKeyUtil,
}))

vi.mock('@/util/document-session/currentWindowOpenPreparationService.js', () => ({
  registerCurrentWindowOpenPreparation() {
    return () => {}
  },
}))

vi.mock('@/util/document-session/documentOpenInteractionService.js', () => ({
  createDocumentOpenInteractionService() {
    return {
      setOpenHandler() {
        return () => {}
      },
      invalidateActiveRequest: vi.fn(),
    }
  },
  registerDocumentOpenInteractionService() {
    return () => {}
  },
}))

vi.mock('@/util/file-manager/fileManagerOpenDecisionController.js', () => ({
  createFileManagerOpenDecisionController() {
    return {
      openDocument: vi.fn(),
    }
  },
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentOpenDialog: vi.fn(),
}))

vi.mock('@/components/layout/LayoutTop.vue', () => ({
  default: {
    name: 'LayoutTopStub',
    template: '<div data-testid="layout-top-stub" />',
  },
}))

vi.mock('@/components/layout/LayoutMenu.vue', () => ({
  default: {
    name: 'LayoutMenuStub',
    template: '<div data-testid="layout-menu-stub" />',
  },
}))

vi.mock('@/components/layout/LayoutContainer.vue', () => ({
  default: {
    name: 'LayoutContainerStub',
    template: '<div data-testid="layout-container-stub" />',
  },
}))

vi.mock('@/components/layout/FileManagerPanel.vue', () => ({
  default: {
    name: 'FileManagerPanelStub',
    template: '<div data-testid="file-manager-panel-stub" />',
  },
}))

vi.mock('@/components/ExternalFileChangeModal.vue', () => ({
  default: {
    name: 'ExternalFileChangeModalStub',
    template: '<div data-testid="external-file-change-modal-stub" />',
  },
}))

function mountHomeView() {
  return mount(HomeView, {
    global: {
      stubs: {
        LayoutTop: true,
        LayoutMenu: true,
        LayoutContainer: true,
        ExternalFileChangeModal: true,
      },
    },
  })
}

function dispatchWindowKeydown(code = 'F11') {
  const event = new KeyboardEvent('keydown', {
    key: code,
    code,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(event)
  return event
}

describe('homeView shortcut key', () => {
  beforeEach(() => {
    mocked.route.name = 'setting'
    mocked.store.config.shortcutKeyList = [
      {
        id: 'toggleFullScreen',
        keymap: 'F11',
        enabled: true,
        type: 'web',
      },
    ]
    mocked.shortcutKeyUtil.isShortcutKey.mockReset()
    mocked.shortcutKeyUtil.getShortcutKey.mockReset()
    mocked.shortcutKeyUtil.getWebShortcutKeyHandler.mockReset()
    mocked.shortcutKeyUtil.isShortcutKey.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('按下默认 F11 时应先阻止宿主默认行为再命中 toggleFullScreen', async () => {
    mocked.shortcutKeyUtil.getShortcutKey.mockReturnValue('F11')
    const wrapper = mountHomeView()

    const event = dispatchWindowKeydown('F11')

    expect(event.defaultPrevented).toBe(true)
    expect(mocked.shortcutKeyUtil.getWebShortcutKeyHandler).toHaveBeenCalledWith('toggleFullScreen', true)

    wrapper.unmount()
  })

  it('裸功能键未命中配置时也应阻止宿主默认行为但不执行快捷键处理器', async () => {
    mocked.shortcutKeyUtil.getShortcutKey.mockReturnValue('F5')
    const wrapper = mountHomeView()

    const event = dispatchWindowKeydown('F5')

    expect(event.defaultPrevented).toBe(true)
    expect(mocked.shortcutKeyUtil.getWebShortcutKeyHandler).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('修改快捷键后应继续按配置命中 toggleFullScreen', async () => {
    mocked.store.config.shortcutKeyList = [
      {
        id: 'toggleFullScreen',
        keymap: 'Ctrl+Alt+Enter',
        enabled: true,
        type: 'web',
      },
    ]
    mocked.shortcutKeyUtil.getShortcutKey.mockReturnValue('Ctrl+Alt+Enter')
    const wrapper = mountHomeView()

    const event = dispatchWindowKeydown('Enter')

    expect(event.defaultPrevented).toBe(false)
    expect(mocked.shortcutKeyUtil.getWebShortcutKeyHandler).toHaveBeenCalledWith('toggleFullScreen', true)

    wrapper.unmount()
  })

  it('文件管理栏快捷键默认留空时，不应误命中处理器', async () => {
    mocked.store.config.shortcutKeyList = [
      {
        id: 'toggleFileManagerPanel',
        keymap: '',
        enabled: true,
        type: 'web',
      },
    ]
    mocked.shortcutKeyUtil.getShortcutKey.mockReturnValue('Ctrl+b')
    const wrapper = mountHomeView()

    const event = dispatchWindowKeydown('KeyB')

    expect(event.defaultPrevented).toBe(false)
    expect(mocked.shortcutKeyUtil.getWebShortcutKeyHandler).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('文件管理栏快捷键配置后，应按当前配置命中 toggleFileManagerPanel', async () => {
    mocked.store.config.shortcutKeyList = [
      {
        id: 'toggleFileManagerPanel',
        keymap: 'Ctrl+b',
        enabled: true,
        type: 'web',
      },
    ]
    mocked.shortcutKeyUtil.getShortcutKey.mockReturnValue('Ctrl+b')
    const wrapper = mountHomeView()

    const event = dispatchWindowKeydown('KeyB')

    expect(event.defaultPrevented).toBe(false)
    expect(mocked.shortcutKeyUtil.getWebShortcutKeyHandler).toHaveBeenCalledWith('toggleFileManagerPanel', true)

    wrapper.unmount()
  })
})
