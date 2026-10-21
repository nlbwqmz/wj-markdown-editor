import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive } from 'vue'

import LayoutTop from '../LayoutTop.vue'

const mocked = vi.hoisted(() => ({
  channelSend: vi.fn(),
}))

const store = reactive({
  fileName: 'demo.md',
  saved: true,
  isMaximize: false,
  isFullScreen: false,
  isAlwaysOnTop: false,
  hasNewVersion: false,
  viewMode: 'split',
  setViewMode: vi.fn(),
  sidebarVisible: true,
  setSidebarVisible: vi.fn(),
  config: {
    language: 'zh-CN',
    theme: {
      global: 'light',
    },
    shortcutKeyList: [],
  },
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

vi.mock('../layoutTopOpenFolderAction.js', () => ({
  createLayoutTopOpenFolderAction: () => vi.fn(),
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

const TooltipStub = {
  name: 'ATooltipStub',
  setup(_props, { slots }) {
    return () => {
      return h('div', {
        'data-testid': 'tooltip-stub',
        'data-tooltip-title': extractTextFromNode(slots.title?.()),
      }, slots.default?.())
    }
  },
}

const DropdownStub = {
  name: 'ADropdownStub',
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'dropdown-stub' }, [
      slots.default?.(),
      slots.overlay?.(),
    ])
  },
}

const MenuStub = {
  name: 'AMenuStub',
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'menu-stub' }, slots.default?.())
  },
}

const MenuItemStub = {
  name: 'AMenuItemStub',
  setup(_props, { attrs, slots }) {
    return () => h('div', {
      'data-testid': 'menu-item-stub',
      ...attrs,
    }, slots.default?.())
  },
}

function mountLayoutTop(options = {}) {
  return mount(LayoutTop, {
    global: {
      mocks: {
        $t: key => key,
      },
      stubs: {
        'a-tooltip': TooltipStub,
        'a-dropdown': DropdownStub,
        'a-menu': MenuStub,
        'a-menu-item': MenuItemStub,
      },
    },
    ...options,
  })
}

// a-tooltip 包裹整个按钮容器，因此要从 tooltip 反向定位所属模式按钮
function getViewModeTooltipTitle(wrapper, mode) {
  return wrapper
    .findAll('[data-testid="tooltip-stub"]')
    .find(item => item.find(`[data-testid="layout-top-view-mode-${mode}"]`).exists())
    .attributes('data-tooltip-title')
}

describe('layoutTop full screen control', () => {
  beforeEach(() => {
    store.fileName = 'demo.md'
    store.saved = true
    store.isMaximize = false
    store.isFullScreen = false
    store.isAlwaysOnTop = false
    store.hasNewVersion = false
    store.viewMode = 'split'
    store.sidebarVisible = true
    store.config.language = 'zh-CN'
    store.config.theme.global = 'light'
    store.config.shortcutKeyList = []
    mocked.channelSend.mockReset()
    store.setViewMode.mockReset()
    store.setSidebarVisible.mockReset()
    mocked.channelSend.mockImplementation(async () => undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('顶部栏不应再渲染全屏按钮', async () => {
    const wrapper = mountLayoutTop()
    const html = wrapper.html()
    const tooltipList = wrapper.findAll('[data-testid="tooltip-stub"]')

    expect(html).not.toContain('i-tabler:arrows-maximize')
    expect(html).not.toContain('i-tabler:arrows-minimize')
    expect(tooltipList.some((item) => {
      const title = item.attributes('data-tooltip-title')
      return title === 'top.enterFullScreen' || title === 'top.exitFullScreen'
    })).toBe(false)
  })

  it('store.isFullScreen 变化后顶部栏仍不应渲染全屏按钮', async () => {
    store.isFullScreen = true
    const wrapper = mountLayoutTop()
    const html = wrapper.html()

    expect(html).not.toContain('i-tabler:arrows-maximize')
    expect(html).not.toContain('i-tabler:arrows-minimize')
  })

  it('移除全屏按钮后仍不应打乱最小化、最大化和关闭按钮顺序', () => {
    store.hasNewVersion = true
    const wrapper = mountLayoutTop()
    const html = wrapper.html()

    expect(html.indexOf('i-tabler:minus')).toBeLessThan(html.indexOf('i-tabler:crop-1-1'))
    expect(html.indexOf('i-tabler:crop-1-1')).toBeLessThan(html.indexOf('i-tabler:x'))
  })

  it('顶部栏应在右侧操作区最左侧渲染切换视图入口', () => {
    const wrapper = mountLayoutTop()
    const html = wrapper.html()

    expect(wrapper.find('[data-testid="layout-top-view-mode-source"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="layout-top-view-mode-split"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="layout-top-view-mode-preview"]').exists()).toBe(true)

    expect(html.indexOf('layout-top-view-mode-source')).toBeLessThan(html.indexOf('i-tabler:moon'))
  })

  it('顶部栏切换视图入口应按源码、双栏、预览顺序提供三种视图模式按钮', () => {
    const wrapper = mountLayoutTop()
    const html = wrapper.html()
    const sourceIndex = html.indexOf('layout-top-view-mode-source')
    const splitIndex = html.indexOf('layout-top-view-mode-split')
    const previewIndex = html.indexOf('layout-top-view-mode-preview')

    expect(sourceIndex).toBeGreaterThan(-1)
    expect(sourceIndex).toBeLessThan(splitIndex)
    expect(splitIndex).toBeLessThan(previewIndex)
  })

  it('点击顶部栏视图模式项时应调用 store.setViewMode 对应模式', async () => {
    const wrapper = mountLayoutTop()

    await wrapper.get('[data-testid="layout-top-view-mode-source"]').trigger('click')
    await wrapper.get('[data-testid="layout-top-view-mode-split"]').trigger('click')
    await wrapper.get('[data-testid="layout-top-view-mode-preview"]').trigger('click')

    expect(store.setViewMode).toHaveBeenNthCalledWith(1, 'source')
    expect(store.setViewMode).toHaveBeenNthCalledWith(2, 'split')
    expect(store.setViewMode).toHaveBeenNthCalledWith(3, 'preview')
  })

  it('顶部栏视图模式按钮应体现当前 viewMode 选中态', () => {
    store.viewMode = 'split'
    const wrapper = mountLayoutTop()

    expect(wrapper.get('[data-testid="layout-top-view-mode-split"]').attributes('data-active')).toBe('true')
    expect(wrapper.get('[data-testid="layout-top-view-mode-source"]').attributes('data-active')).toBe('false')
    expect(wrapper.get('[data-testid="layout-top-view-mode-preview"]').attributes('data-active')).toBe('false')
  })

  it('viewMode 变化后顶部栏视图模式按钮选中态应同步更新', async () => {
    store.viewMode = 'source'
    const wrapper = mountLayoutTop()

    expect(wrapper.get('[data-testid="layout-top-view-mode-source"]').attributes('data-active')).toBe('true')

    store.viewMode = 'preview'
    await nextTick()

    expect(wrapper.get('[data-testid="layout-top-view-mode-preview"]').attributes('data-active')).toBe('true')
    expect(wrapper.get('[data-testid="layout-top-view-mode-source"]').attributes('data-active')).toBe('false')
  })

  it('顶部栏视图模式按钮组后应渲染分组竖线', () => {
    const wrapper = mountLayoutTop()
    const html = wrapper.html()
    const divider = wrapper.find('[data-testid="layout-top-view-group-divider"]')

    expect(divider.exists()).toBe(true)
    expect(html.indexOf('layout-top-view-group-divider')).toBeGreaterThan(html.indexOf('layout-top-view-mode-preview'))
    expect(html.indexOf('layout-top-view-group-divider')).toBeLessThan(html.indexOf('i-tabler:moon'))
  })

  it('配置了快捷键时视图模式 tooltip 应展示快捷键', () => {
    store.config.shortcutKeyList = [{ id: 'viewSplit', keymap: 'Ctrl+2', enabled: true }]
    const wrapper = mountLayoutTop()
    const title = getViewModeTooltipTitle(wrapper, 'split')

    expect(title).toContain('shortcutKey.viewSplit')
    expect(title).toContain('Ctrl+2')
  })

  it('快捷键 keymap 为空时视图模式 tooltip 不应展示快捷键', () => {
    store.config.shortcutKeyList = [{ id: 'viewSplit', keymap: '', enabled: true }]
    const wrapper = mountLayoutTop()
    const title = getViewModeTooltipTitle(wrapper, 'split')

    expect(title).toContain('shortcutKey.viewSplit')
    expect(title).not.toContain('Ctrl')
  })

  it('快捷键 enabled 为 false 时视图模式 tooltip 不应展示快捷键', () => {
    store.config.shortcutKeyList = [{ id: 'viewSplit', keymap: 'Ctrl+2', enabled: false }]
    const wrapper = mountLayoutTop()
    const title = getViewModeTooltipTitle(wrapper, 'split')

    expect(title).toContain('shortcutKey.viewSplit')
    expect(title).not.toContain('Ctrl+2')
  })

  it('快捷键配置变化后视图模式 tooltip 应响应式更新', async () => {
    const wrapper = mountLayoutTop()
    const splitTooltip = () => getViewModeTooltipTitle(wrapper, 'split')

    expect(splitTooltip()).not.toContain('Ctrl+2')

    store.config.shortcutKeyList = [{ id: 'viewSplit', keymap: 'Ctrl+2', enabled: true }]
    await nextTick()

    expect(splitTooltip()).toContain('Ctrl+2')
  })

  it('配置中缺失 shortcutKeyList 时视图模式按钮仍应正常渲染', () => {
    delete store.config.shortcutKeyList

    const wrapper = mountLayoutTop()

    expect(wrapper.find('[data-testid="layout-top-view-mode-source"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="layout-top-view-mode-split"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="layout-top-view-mode-preview"]').exists()).toBe(true)
  })

  it('切换主题时必须通过 config.update 提交 theme.global mutation', async () => {
    const wrapper = mountLayoutTop()
    mocked.channelSend.mockClear()

    await wrapper.get('[data-tooltip-title="top.switchTheme"] > div').trigger('click')

    expect(mocked.channelSend).toHaveBeenCalledWith({
      event: 'config.update',
      data: {
        operations: [
          {
            type: 'set',
            path: ['theme', 'global'],
            value: 'dark',
          },
        ],
      },
    })
    expect(mocked.channelSend.mock.calls.some(([payload]) => payload?.event === 'user-update-theme-global')).toBe(false)
  })

  it('切换语言时必须通过 config.update 提交 language mutation', async () => {
    const wrapper = mountLayoutTop()
    mocked.channelSend.mockClear()

    const englishMenuItem = wrapper.findAll('[data-testid="menu-item-stub"]')
      .find(item => item.text().includes('English'))
    expect(englishMenuItem).toBeTruthy()

    await englishMenuItem.trigger('click')

    expect(mocked.channelSend).toHaveBeenCalledWith({
      event: 'config.update',
      data: {
        operations: [
          {
            type: 'set',
            path: ['language'],
            value: 'en-US',
          },
        ],
      },
    })
    expect(mocked.channelSend.mock.calls.some(([payload]) => payload?.event === 'user-update-language')).toBe(false)
  })

  it('侧边栏开关按钮应位于品牌竖线之后、菜单竖线之前', () => {
    const wrapper = mountLayoutTop()
    const html = wrapper.html()

    expect(wrapper.find('[data-testid="layout-top-toggle-sidebar"]').exists()).toBe(true)
    expect(html.indexOf('layout-top-brand-divider')).toBeLessThan(html.indexOf('layout-top-toggle-sidebar'))
    expect(html.indexOf('layout-top-toggle-sidebar')).toBeLessThan(html.indexOf('layout-top-menu-divider'))
  })

  it('侧边栏可见时按钮应渲染收起图标与可见态标记', () => {
    store.sidebarVisible = true
    const wrapper = mountLayoutTop()
    const button = wrapper.get('[data-testid="layout-top-toggle-sidebar"]')

    expect(button.find('.i-tabler\\:layout-sidebar-left-collapse').exists()).toBe(true)
    expect(button.attributes('data-active')).toBe('true')
  })

  it('侧边栏隐藏时按钮应渲染展开图标与隐藏态标记', () => {
    store.sidebarVisible = false
    const wrapper = mountLayoutTop()
    const button = wrapper.get('[data-testid="layout-top-toggle-sidebar"]')

    expect(button.find('.i-tabler\\:layout-sidebar-left-expand').exists()).toBe(true)
    expect(button.attributes('data-active')).toBe('false')
  })

  it('点击侧边栏开关按钮应按当前可见态切换 store.setSidebarVisible', async () => {
    store.sidebarVisible = true
    const visibleWrapper = mountLayoutTop()

    await visibleWrapper.get('[data-testid="layout-top-toggle-sidebar"]').trigger('click')

    expect(store.setSidebarVisible).toHaveBeenNthCalledWith(1, false)

    store.sidebarVisible = false
    const hiddenWrapper = mountLayoutTop()

    await hiddenWrapper.get('[data-testid="layout-top-toggle-sidebar"]').trigger('click')

    expect(store.setSidebarVisible).toHaveBeenNthCalledWith(2, true)
  })

  it('侧边栏开关的外层只做触发、内层背景层仅承载 hover', () => {
    store.sidebarVisible = false
    const hiddenWrapper = mountLayoutTop()
    const hiddenButton = hiddenWrapper.get('[data-testid="layout-top-toggle-sidebar"]')
    const hiddenSurface = hiddenButton.find('div')

    // 外层：32×32 仅作 hover 触发区，不承载背景
    expect(hiddenButton.classes()).toContain('group')
    expect(hiddenButton.classes()).toContain('h-8')
    expect(hiddenButton.classes()).toContain('w-8')
    expect(hiddenButton.classes()).not.toContain('bg-bg-hover')
    expect(hiddenButton.classes()).not.toContain('hover:bg-bg-hover')

    // 内层：28×28 圆角背景层，只有 group-hover 背景，没有选中态
    expect(hiddenSurface.classes()).toContain('h-7')
    expect(hiddenSurface.classes()).toContain('w-7')
    expect(hiddenSurface.classes()).toContain('rounded-1')
    expect(hiddenSurface.classes()).toContain('group-hover:bg-bg-hover')
    expect(hiddenSurface.classes()).not.toContain('bg-bg-hover')

    store.sidebarVisible = true
    const visibleWrapper = mountLayoutTop()
    const visibleButton = visibleWrapper.get('[data-testid="layout-top-toggle-sidebar"]')
    const visibleSurface = visibleButton.find('div')

    // 可见态同样不渲染选中背景，仅保留 hover
    expect(visibleButton.classes()).toContain('group')
    expect(visibleButton.classes()).toContain('h-8')
    expect(visibleButton.classes()).toContain('w-8')
    expect(visibleButton.classes()).not.toContain('bg-bg-hover')
    expect(visibleButton.classes()).not.toContain('hover:bg-bg-hover')

    expect(visibleSurface.classes()).toContain('h-7')
    expect(visibleSurface.classes()).toContain('w-7')
    expect(visibleSurface.classes()).toContain('rounded-1')
    expect(visibleSurface.classes()).toContain('group-hover:bg-bg-hover')
    expect(visibleSurface.classes()).not.toContain('bg-bg-hover')
  })

  it('配置了侧边栏快捷键时 tooltip 应展示文案与快捷键', () => {
    store.config.shortcutKeyList = [{ id: 'toggleFileManagerPanel', keymap: 'Ctrl+Shift+S', enabled: true }]
    const wrapper = mountLayoutTop()
    const title = wrapper
      .findAll('[data-testid="tooltip-stub"]')
      .find(item => item.find('[data-testid="layout-top-toggle-sidebar"]').exists())
      .attributes('data-tooltip-title')

    expect(title).toContain('topMenu.view.children.closeSidebar')
    expect(title).toContain('Ctrl+Shift+S')
  })

  it('品牌竖线、侧边栏按钮、菜单竖线、菜单 slot 与视图模式按钮应顺序排列', () => {
    const wrapper = mountLayoutTop({ slots: { menu: '<div data-testid="menu-slot-content" />' } })
    const html = wrapper.html()

    expect(wrapper.find('[data-testid="layout-top-brand-divider"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="layout-top-menu-divider"]').exists()).toBe(true)

    expect(html.indexOf('layout-top-brand-divider')).toBeLessThan(html.indexOf('layout-top-toggle-sidebar'))
    expect(html.indexOf('layout-top-toggle-sidebar')).toBeLessThan(html.indexOf('layout-top-menu-divider'))
    expect(html.indexOf('layout-top-menu-divider')).toBeLessThan(html.indexOf('menu-slot-content'))
    expect(html.indexOf('menu-slot-content')).toBeLessThan(html.indexOf('layout-top-view-mode-source'))
  })

  it('menu slot 内容应渲染在菜单竖线之后、视图模式按钮之前', () => {
    const wrapper = mountLayoutTop({ slots: { menu: '<div data-testid="menu-slot-content" />' } })
    const html = wrapper.html()

    expect(wrapper.find('[data-testid="menu-slot-content"]').exists()).toBe(true)
    expect(html.indexOf('layout-top-menu-divider')).toBeLessThan(html.indexOf('menu-slot-content'))
    expect(html.indexOf('menu-slot-content')).toBeLessThan(html.indexOf('layout-top-view-mode-source'))
  })
})
