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
  config: {
    language: 'zh-CN',
    theme: {
      global: 'light',
    },
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

function mountLayoutTop() {
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
  })
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
    store.config.language = 'zh-CN'
    store.config.theme.global = 'light'
    mocked.channelSend.mockReset()
    store.setViewMode.mockReset()
    mocked.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'app-info') {
        return {
          name: 'wj-markdown-editor',
          version: '2.17.0',
        }
      }

      return undefined
    })
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

    expect(html).toContain('i-tabler:arrows-left-right')
    expect(html.indexOf('i-tabler:arrows-left-right')).toBeLessThan(html.indexOf('i-tabler:moon'))
  })

  it('顶部栏切换视图入口应以下拉方式提供三种视图模式选项', () => {
    const wrapper = mountLayoutTop()
    const html = wrapper.html()

    expect(html).toContain('i-tabler:arrows-left-right')
    expect(html.indexOf('i-tabler:arrows-left-right')).toBeLessThan(html.indexOf('i-tabler:moon'))

    expect(wrapper.get('[data-testid="layout-top-view-mode-source"]').text()).toContain('shortcutKey.viewSource')
    expect(wrapper.get('[data-testid="layout-top-view-mode-split"]').text()).toContain('shortcutKey.viewSplit')
    expect(wrapper.get('[data-testid="layout-top-view-mode-preview"]').text()).toContain('shortcutKey.viewPreview')
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

  it('顶部栏视图下拉应体现当前 viewMode 选中态', () => {
    store.viewMode = 'split'
    const wrapper = mountLayoutTop()

    expect(wrapper.get('[data-testid="layout-top-view-mode-split"]').find('.i-tabler\\:check').exists()).toBe(true)
    expect(wrapper.get('[data-testid="layout-top-view-mode-source"]').find('.i-tabler\\:check').exists()).toBe(false)
    expect(wrapper.get('[data-testid="layout-top-view-mode-preview"]').find('.i-tabler\\:check').exists()).toBe(false)
  })

  it('viewMode 变化后顶部栏视图下拉选中态应同步更新', async () => {
    store.viewMode = 'source'
    const wrapper = mountLayoutTop()

    expect(wrapper.get('[data-testid="layout-top-view-mode-source"]').find('.i-tabler\\:check').exists()).toBe(true)

    store.viewMode = 'preview'
    await nextTick()

    expect(wrapper.get('[data-testid="layout-top-view-mode-preview"]').find('.i-tabler\\:check').exists()).toBe(true)
    expect(wrapper.get('[data-testid="layout-top-view-mode-source"]').find('.i-tabler\\:check').exists()).toBe(false)
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
})
