import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, reactive } from 'vue'

import LayoutTop from '../LayoutTop.vue'

const mocked = vi.hoisted(() => ({
  channelSend: vi.fn(),
  getShortcutHandler: vi.fn(),
  switchViewHandler: vi.fn(),
}))

const store = reactive({
  fileName: 'demo.md',
  saved: true,
  isMaximize: false,
  isFullScreen: false,
  isAlwaysOnTop: false,
  hasNewVersion: false,
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

vi.mock('@/util/shortcutKeyUtil.js', () => ({
  default: {
    getWebShortcutKeyHandler: (...args) => mocked.getShortcutHandler(...args),
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
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'menu-item-stub' }, slots.default?.())
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
    store.config.language = 'zh-CN'
    store.config.theme.global = 'light'
    mocked.channelSend.mockReset()
    mocked.getShortcutHandler.mockReset()
    mocked.switchViewHandler.mockReset()
    mocked.getShortcutHandler.mockImplementation((id, execute) => {
      if (id === 'switchView') {
        if (execute === true) {
          mocked.switchViewHandler()
          return undefined
        }

        return mocked.switchViewHandler
      }

      return vi.fn()
    })
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
    const tooltipList = wrapper.findAll('[data-testid="tooltip-stub"]')

    expect(html).toContain('i-tabler:arrows-left-right')
    expect(tooltipList.some(item => item.attributes('data-tooltip-title') === 'top.switchView')).toBe(true)
    expect(html.indexOf('i-tabler:arrows-left-right')).toBeLessThan(html.indexOf('i-tabler:moon'))
  })

  it('点击顶部栏切换视图入口时应调用共享 switchView 动作', async () => {
    const wrapper = mountLayoutTop()

    await wrapper.get('[data-testid="layout-top-switch-view"]').trigger('click')

    expect(mocked.getShortcutHandler).toHaveBeenCalledWith('switchView', true)
    expect(mocked.switchViewHandler).toHaveBeenCalledTimes(1)
  })
})
