import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import HomeView from '../HomeView.vue'
import HomeViewSource from '../HomeView.vue?raw'

const FILE_MANAGER_GUTTER_BORDER_COLOR = 'rgb(229, 231, 235)'
const HOME_VIEW_STYLE_MATCH = HomeViewSource.match(/<style scoped lang="scss">([\s\S]*?)<\/style>/u)
if (!HOME_VIEW_STYLE_MATCH) {
  throw new Error('HomeView.vue 缺少用于文件管理栏 gutter 的样式块')
}

const HOME_VIEW_SCOPED_STYLE_TEXT = HOME_VIEW_STYLE_MATCH[1].trim()
const mountedHomeViewWrappers = []
let homeViewStyleElement = null

const homeViewFileManagerHostState = vi.hoisted(() => ({
  route: null,
  splitDestroy: vi.fn(),
  openPreparationHandlers: [],
  openInteractionHandlers: [],
  openInteractionServiceCreateOptionsList: [],
  openDecisionOpenDocument: vi.fn(),
  openDecisionFactory: vi.fn(),
  registeredInteractionServiceList: [],
  invalidateActiveRequest: vi.fn(),
  requestDocumentOpenDialog: vi.fn(),
  shortcutKeyUtil: {
    isShortcutKey: vi.fn(() => false),
    getShortcutKey: vi.fn(),
    getWebShortcutKeyHandler: vi.fn(),
  },
  store: null,
}))

vi.mock('split-grid', () => ({
  default() {
    return {
      destroy: homeViewFileManagerHostState.splitDestroy,
    }
  },
}))

vi.mock('vue-router', () => ({
  useRoute() {
    return homeViewFileManagerHostState.route
  },
}))

vi.mock('vue-i18n', () => ({
  createI18n() {
    return {
      global: {
        t: value => value,
      },
    }
  },
  useI18n() {
    return {
      t: value => value,
    }
  },
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return homeViewFileManagerHostState.store
  },
}))

vi.mock('@/util/shortcutKeyUtil.js', () => ({
  default: homeViewFileManagerHostState.shortcutKeyUtil,
}))

vi.mock('@/util/document-session/currentWindowOpenPreparationService.js', () => ({
  registerCurrentWindowOpenPreparation(handler) {
    homeViewFileManagerHostState.openPreparationHandlers.push(handler)
    return () => {
      const handlerIndex = homeViewFileManagerHostState.openPreparationHandlers.indexOf(handler)
      if (handlerIndex >= 0) {
        homeViewFileManagerHostState.openPreparationHandlers.splice(handlerIndex, 1)
      }
    }
  },
}))

vi.mock('@/util/document-session/documentOpenInteractionService.js', () => ({
  createDocumentOpenInteractionService(options = {}) {
    homeViewFileManagerHostState.openInteractionServiceCreateOptionsList.push(options)
    return {
      setOpenHandler(handler) {
        homeViewFileManagerHostState.openInteractionHandlers.push(handler)
        return () => {
          const handlerIndex = homeViewFileManagerHostState.openInteractionHandlers.indexOf(handler)
          if (handlerIndex >= 0) {
            homeViewFileManagerHostState.openInteractionHandlers.splice(handlerIndex, 1)
          }
        }
      },
      invalidateActiveRequest: homeViewFileManagerHostState.invalidateActiveRequest,
      requestDocumentOpenByDialog: vi.fn(async () => {
        const selectedPath = await options.requestDocumentOpenDialog?.()
        if (typeof selectedPath !== 'string' || !selectedPath) {
          return {
            ok: false,
            reason: 'cancelled',
            path: null,
          }
        }

        return {
          ok: true,
          reason: 'selected',
          path: selectedPath,
        }
      }),
      requestDocumentOpenPath: vi.fn(),
    }
  },
  registerDocumentOpenInteractionService(service) {
    homeViewFileManagerHostState.registeredInteractionServiceList.push(service)
    return () => {
      const serviceIndex = homeViewFileManagerHostState.registeredInteractionServiceList.indexOf(service)
      if (serviceIndex >= 0) {
        homeViewFileManagerHostState.registeredInteractionServiceList.splice(serviceIndex, 1)
      }
    }
  },
}))

vi.mock('@/util/file-manager/fileManagerOpenDecisionController.js', () => ({
  createFileManagerOpenDecisionController: homeViewFileManagerHostState.openDecisionFactory,
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentOpenDialog: homeViewFileManagerHostState.requestDocumentOpenDialog,
}))

vi.mock('@/components/layout/LayoutTop.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'LayoutTopStub',
      setup() {
        return () => h('div', { 'data-testid': 'layout-top-stub' })
      },
    }),
  }
})

vi.mock('@/components/layout/LayoutMenu.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'LayoutMenuStub',
      setup() {
        return () => h('div', { 'data-testid': 'layout-menu-stub' })
      },
    }),
  }
})

vi.mock('@/components/layout/LayoutContainer.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'LayoutContainerStub',
      setup() {
        return () => h('div', { 'data-testid': 'layout-container-stub' })
      },
    }),
  }
})

vi.mock('@/components/layout/FileManagerPanel.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'FileManagerPanelStub',
      setup() {
        return () => h('div', { 'data-testid': 'file-manager-panel-stub' })
      },
    }),
  }
})

vi.mock('@/components/ExternalFileChangeModal.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'ExternalFileChangeModalStub',
      setup() {
        return () => h('div', { 'data-testid': 'external-file-change-modal-stub' })
      },
    }),
  }
})

async function flushHomeView() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function mountHomeView({
  routeName = 'editor',
  fileManagerPanelVisible = true,
} = {}) {
  homeViewFileManagerHostState.route.name = routeName
  homeViewFileManagerHostState.store.fileManagerPanelVisible = fileManagerPanelVisible
  const attachTarget = document.createElement('div')
  document.body.appendChild(attachTarget)

  const wrapper = mount(HomeView, {
    attachTo: attachTarget,
  })
  mountedHomeViewWrappers.push(wrapper)

  await flushHomeView()
  return wrapper
}

async function mountHomeViewByRoute(path) {
  const routeName = path.replace(/^\//u, '')
  return await mountHomeView({
    routeName,
  })
}

describe('homeView 文件管理栏宿主壳层', () => {
  beforeEach(() => {
    homeViewFileManagerHostState.route = reactive({
      name: 'editor',
    })
    homeViewFileManagerHostState.store = reactive({
      config: {
        shortcutKeyList: [],
      },
      fileManagerPanelVisible: true,
      documentSessionSnapshot: null,
      setFileManagerPanelVisible: vi.fn(),
    })
    homeViewFileManagerHostState.splitDestroy.mockReset()
    homeViewFileManagerHostState.openPreparationHandlers.splice(0)
    homeViewFileManagerHostState.openInteractionHandlers.splice(0)
    homeViewFileManagerHostState.openInteractionServiceCreateOptionsList.splice(0)
    homeViewFileManagerHostState.registeredInteractionServiceList.splice(0)
    homeViewFileManagerHostState.openDecisionOpenDocument.mockReset()
    homeViewFileManagerHostState.openDecisionFactory.mockReset()
    homeViewFileManagerHostState.invalidateActiveRequest.mockReset()
    homeViewFileManagerHostState.requestDocumentOpenDialog.mockReset()
    homeViewFileManagerHostState.requestDocumentOpenDialog.mockResolvedValue('D:/docs/from-dialog.md')
    homeViewFileManagerHostState.shortcutKeyUtil.isShortcutKey.mockReset()
    homeViewFileManagerHostState.shortcutKeyUtil.getShortcutKey.mockReset()
    homeViewFileManagerHostState.shortcutKeyUtil.getWebShortcutKeyHandler.mockReset()
    homeViewFileManagerHostState.shortcutKeyUtil.isShortcutKey.mockReturnValue(false)
    homeViewFileManagerHostState.store.fileManagerPanelVisible = true
    homeViewFileManagerHostState.store.setFileManagerPanelVisible.mockReset()
    homeViewFileManagerHostState.openDecisionFactory.mockReturnValue({
      openDocument: homeViewFileManagerHostState.openDecisionOpenDocument,
    })
    document.documentElement.style.setProperty('--wj-markdown-border-primary', FILE_MANAGER_GUTTER_BORDER_COLOR)
    homeViewStyleElement = document.createElement('style')
    homeViewStyleElement.textContent = HOME_VIEW_SCOPED_STYLE_TEXT
    document.head.appendChild(homeViewStyleElement)
  })

  afterEach(() => {
    while (mountedHomeViewWrappers.length > 0) {
      mountedHomeViewWrappers.pop()?.unmount()
    }
    document.documentElement.style.removeProperty('--wj-markdown-border-primary')
    homeViewStyleElement?.remove()
    homeViewStyleElement = null
    document.body.innerHTML = ''
    homeViewFileManagerHostState.route = null
    homeViewFileManagerHostState.store = null
    vi.clearAllMocks()
  })

  it('homeView 主窗口壳层应挂载文件管理栏宿主与外层 gutter', async () => {
    const wrapper = await mountHomeView()

    expect(wrapper.find('[data-testid="home-file-manager-host"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-file-manager-gutter"]').exists()).toBe(true)

    const fileManagerPanelSlot = wrapper.get('[data-testid="home-file-manager-panel-slot"]')
    const fileManagerGutter = wrapper.get('[data-testid="home-file-manager-gutter"]')
    expect(fileManagerPanelSlot.classes()).toContain('b-t-1')
    expect(fileManagerPanelSlot.classes()).toContain('b-t-border-primary')
    expect(fileManagerPanelSlot.classes()).toContain('b-t-solid')
    expect(fileManagerGutter.classes()).toContain('wj-sash')
    expect(fileManagerGutter.classes()).toContain('wj-sash--vertical')

    wrapper.unmount()
  })

  it('文件管理栏宿主应把右边界交给 gutter，而不是 panel slot', async () => {
    const wrapper = await mountHomeView()
    const fileManagerPanelSlot = wrapper.get('[data-testid="home-file-manager-panel-slot"]')
    const fileManagerGutter = wrapper.get('[data-testid="home-file-manager-gutter"]')
    const rootStyle = window.getComputedStyle(document.documentElement)

    expect(fileManagerPanelSlot.classes()).not.toContain('b-r-1')
    expect(fileManagerPanelSlot.classes()).not.toContain('b-r-border-primary')
    expect(fileManagerPanelSlot.classes()).not.toContain('b-r-solid')
    expect(fileManagerPanelSlot.classes()).toContain('b-t-1')
    expect(rootStyle.getPropertyValue('--wj-markdown-border-primary').trim()).toBe(FILE_MANAGER_GUTTER_BORDER_COLOR)
    expect(fileManagerGutter.classes()).toContain('wj-sash')
    expect(fileManagerGutter.classes()).toContain('wj-sash--vertical')
  })

  it('文件管理栏 gutter 必须使用统一 sash 样式，不能继续透明', async () => {
    const wrapper = await mountHomeView()
    const fileManagerGutter = wrapper.get('[data-testid="home-file-manager-gutter"]')

    expect(fileManagerGutter.classes()).not.toContain('op-0')
    expect(fileManagerGutter.classes()).not.toContain('hidden')
    expect(fileManagerGutter.classes()).not.toContain('invisible')
    expect(fileManagerGutter.classes()).toContain('wj-sash')
    expect(fileManagerGutter.classes()).toContain('wj-sash--vertical')
  })

  it('文件管理栏只应在 editor 与 preview 路由显示，在 setting / export / about / guide 路由隐藏', async () => {
    expect((await mountHomeViewByRoute('/editor')).find('[data-testid="home-file-manager-host"]').exists()).toBe(true)
    expect((await mountHomeViewByRoute('/preview')).find('[data-testid="home-file-manager-host"]').exists()).toBe(true)
    expect((await mountHomeViewByRoute('/setting')).find('[data-testid="home-file-manager-host"]').exists()).toBe(false)
    expect((await mountHomeViewByRoute('/export')).find('[data-testid="home-file-manager-host"]').exists()).toBe(false)
    expect((await mountHomeViewByRoute('/about')).find('[data-testid="home-file-manager-host"]').exists()).toBe(false)
    expect((await mountHomeViewByRoute('/guide')).find('[data-testid="home-file-manager-host"]').exists()).toBe(false)
  })

  it('文件管理栏关闭后不应保留左侧唤起手柄，宿主应收拢为单列', async () => {
    const wrapper = await mountHomeView({
      fileManagerPanelVisible: false,
    })

    expect(wrapper.find('[data-testid="home-file-manager-reopen-handle"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="home-file-manager-host"]').attributes('style')).toContain('grid-template-columns: 1fr;')

    wrapper.unmount()
  })

  it('homeView 作为宿主时，应注册统一打开交互处理器和当前窗口准备器', async () => {
    const wrapper = await mountHomeView()

    expect(homeViewFileManagerHostState.openPreparationHandlers.length).toBe(1)
    expect(homeViewFileManagerHostState.openInteractionHandlers.length).toBe(1)
    expect(homeViewFileManagerHostState.registeredInteractionServiceList).toHaveLength(1)
    expect(homeViewFileManagerHostState.openInteractionServiceCreateOptionsList).toHaveLength(1)
    expect(homeViewFileManagerHostState.openInteractionServiceCreateOptionsList[0].requestDocumentOpenDialog).toBeTypeOf('function')

    wrapper.unmount()
  })

  it('homeView 创建统一打开交互 service 时，必须接入 renderer 的 requestDocumentOpenDialog', async () => {
    await mountHomeView()

    const dialogResult = await homeViewFileManagerHostState.registeredInteractionServiceList[0].requestDocumentOpenByDialog()

    expect(homeViewFileManagerHostState.requestDocumentOpenDialog).toHaveBeenCalledTimes(1)
    expect(dialogResult).toEqual({
      ok: true,
      reason: 'selected',
      path: 'D:/docs/from-dialog.md',
    })
  })

  it('统一打开交互处理器应把请求转发给 renderer 打开编排 controller', async () => {
    homeViewFileManagerHostState.openDecisionOpenDocument.mockResolvedValue({
      ok: true,
      reason: 'opened',
      path: 'D:/docs/next.md',
    })
    await mountHomeView()

    const result = await homeViewFileManagerHostState.openInteractionHandlers[0]({
      path: 'D:/docs/next.md',
      entrySource: 'shortcut-open-file',
      trigger: 'user',
    })

    expect(homeViewFileManagerHostState.openDecisionOpenDocument).toHaveBeenCalledWith('D:/docs/next.md', {
      entrySource: 'shortcut-open-file',
      trigger: 'user',
    })
    expect(result).toEqual({
      ok: true,
      reason: 'opened',
      path: 'D:/docs/next.md',
    })
  })

  it('homeView 卸载时，应使当前活动打开请求失效', async () => {
    const wrapper = await mountHomeView()

    expect(homeViewFileManagerHostState.invalidateActiveRequest).not.toHaveBeenCalled()

    wrapper.unmount()

    expect(homeViewFileManagerHostState.invalidateActiveRequest).toHaveBeenCalledTimes(1)
    expect(homeViewFileManagerHostState.registeredInteractionServiceList).toHaveLength(0)
  })

  it('session identity 变化时，应使当前活动打开请求失效', async () => {
    await mountHomeView()

    expect(homeViewFileManagerHostState.invalidateActiveRequest).not.toHaveBeenCalled()

    homeViewFileManagerHostState.store.documentSessionSnapshot = {
      sessionId: 'session-1',
      revision: 1,
    }
    await flushHomeView()

    expect(homeViewFileManagerHostState.invalidateActiveRequest).toHaveBeenCalledTimes(1)
  })

  it('仅 revision 变化时，不应使当前活动打开请求失效', async () => {
    await mountHomeView()
    homeViewFileManagerHostState.store.documentSessionSnapshot = {
      sessionId: 'session-1',
      revision: 1,
    }
    await flushHomeView()
    homeViewFileManagerHostState.invalidateActiveRequest.mockClear()

    homeViewFileManagerHostState.store.documentSessionSnapshot = {
      sessionId: 'session-1',
      revision: 2,
    }
    await flushHomeView()

    expect(homeViewFileManagerHostState.invalidateActiveRequest).not.toHaveBeenCalled()
  })

  it('route.name 变化时，应使当前活动打开请求失效', async () => {
    await mountHomeView()

    expect(homeViewFileManagerHostState.invalidateActiveRequest).not.toHaveBeenCalled()

    homeViewFileManagerHostState.route.name = 'preview'
    await flushHomeView()

    expect(homeViewFileManagerHostState.invalidateActiveRequest).toHaveBeenCalledTimes(1)
  })
})
