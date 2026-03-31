import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import HomeView from '../HomeView.vue'
import HomeViewSource from '../HomeView.vue?raw'

const FILE_MANAGER_GUTTER_BORDER_COLOR = 'rgb(229, 231, 235)'
const FILE_MANAGER_GUTTER_BACKGROUND_STYLE = 'var(--wj-markdown-border-primary)'
const HOME_VIEW_STYLE_MATCH = HomeViewSource.match(/<style scoped lang="scss">([\s\S]*?)<\/style>/u)
if (!HOME_VIEW_STYLE_MATCH) {
  throw new Error('HomeView.vue 缺少用于文件管理栏 gutter 的样式块')
}

const HOME_VIEW_SCOPED_STYLE_TEXT = HOME_VIEW_STYLE_MATCH[1].trim()
const mountedHomeViewWrappers = []
let homeViewStyleElement = null

const homeViewFileManagerHostState = vi.hoisted(() => ({
  route: {
    name: 'editor',
  },
  splitDestroy: vi.fn(),
  shortcutKeyUtil: {
    isShortcutKey: vi.fn(() => false),
    getShortcutKey: vi.fn(),
    getWebShortcutKeyHandler: vi.fn(),
  },
  store: {
    config: {
      shortcutKeyList: [],
    },
    fileManagerPanelVisible: true,
    setFileManagerPanelVisible: vi.fn(),
  },
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

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return homeViewFileManagerHostState.store
  },
}))

vi.mock('@/util/shortcutKeyUtil.js', () => ({
  default: homeViewFileManagerHostState.shortcutKeyUtil,
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
    homeViewFileManagerHostState.route.name = 'editor'
    homeViewFileManagerHostState.splitDestroy.mockReset()
    homeViewFileManagerHostState.shortcutKeyUtil.isShortcutKey.mockReset()
    homeViewFileManagerHostState.shortcutKeyUtil.getShortcutKey.mockReset()
    homeViewFileManagerHostState.shortcutKeyUtil.getWebShortcutKeyHandler.mockReset()
    homeViewFileManagerHostState.shortcutKeyUtil.isShortcutKey.mockReturnValue(false)
    homeViewFileManagerHostState.store.fileManagerPanelVisible = true
    homeViewFileManagerHostState.store.setFileManagerPanelVisible.mockReset()
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
    expect(fileManagerGutter.classes()).toContain('b-t-1')
    expect(fileManagerGutter.classes()).toContain('b-t-border-primary')
    expect(fileManagerGutter.classes()).toContain('b-t-solid')

    wrapper.unmount()
  })

  it('文件管理栏宿主应把右边界交给 gutter，而不是 panel slot', async () => {
    const wrapper = await mountHomeView()
    const fileManagerPanelSlot = wrapper.get('[data-testid="home-file-manager-panel-slot"]')
    const fileManagerGutter = wrapper.get('[data-testid="home-file-manager-gutter"]')
    const fileManagerGutterStyle = window.getComputedStyle(fileManagerGutter.element)
    const rootStyle = window.getComputedStyle(document.documentElement)

    expect(fileManagerPanelSlot.classes()).not.toContain('b-r-1')
    expect(fileManagerPanelSlot.classes()).not.toContain('b-r-border-primary')
    expect(fileManagerPanelSlot.classes()).not.toContain('b-r-solid')
    expect(fileManagerPanelSlot.classes()).toContain('b-t-1')
    expect(rootStyle.getPropertyValue('--wj-markdown-border-primary').trim()).toBe(FILE_MANAGER_GUTTER_BORDER_COLOR)
    expect(fileManagerGutterStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(fileManagerGutterStyle.backgroundColor).toBe(FILE_MANAGER_GUTTER_BACKGROUND_STYLE)
  })

  it('文件管理栏 gutter 必须保持可见，不能继续透明', async () => {
    const wrapper = await mountHomeView()
    const fileManagerGutter = wrapper.get('[data-testid="home-file-manager-gutter"]')
    const fileManagerGutterStyle = window.getComputedStyle(fileManagerGutter.element)

    expect(fileManagerGutter.classes()).toContain('b-t-1')
    expect(fileManagerGutter.classes()).not.toContain('op-0')
    expect(fileManagerGutter.classes()).not.toContain('hidden')
    expect(fileManagerGutter.classes()).not.toContain('invisible')
    expect(fileManagerGutterStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(fileManagerGutterStyle.backgroundColor).toBe(FILE_MANAGER_GUTTER_BACKGROUND_STYLE)
    expect(fileManagerGutterStyle.opacity).not.toBe('0')
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
})
