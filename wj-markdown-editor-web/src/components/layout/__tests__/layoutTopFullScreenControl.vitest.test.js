import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, reactive } from 'vue'

import LayoutTop from '../LayoutTop.vue'

const mocked = vi.hoisted(() => ({
  channelSend: vi.fn(),
  toggleFullScreenAction: vi.fn(),
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

vi.mock('@/util/fullScreenActionUtil.js', () => ({
  default: mocked.toggleFullScreenAction,
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
    mocked.toggleFullScreenAction.mockReset()
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

  it('非全屏时应显示进入全屏图标和 tooltip，并调用共享动作', async () => {
    const wrapper = mountLayoutTop()
    const actionButtons = wrapper.findAll('div.h-8.w-8')
    const tooltipList = wrapper.findAll('[data-testid="tooltip-stub"]')

    expect(actionButtons[0].html()).toContain('i-tabler:arrows-maximize')
    expect(tooltipList[0].attributes('data-tooltip-title')).toBe('top.enterFullScreen')

    await actionButtons[0].trigger('click')

    expect(mocked.toggleFullScreenAction).toHaveBeenCalledTimes(1)
    expect(mocked.channelSend).not.toHaveBeenCalledWith(expect.objectContaining({
      event: 'full-screen',
    }))
  })

  it('已全屏时应显示退出全屏图标和 tooltip，并调用共享动作', async () => {
    store.isFullScreen = true
    const wrapper = mountLayoutTop()
    const actionButtons = wrapper.findAll('div.h-8.w-8')
    const tooltipList = wrapper.findAll('[data-testid="tooltip-stub"]')

    expect(actionButtons[0].html()).toContain('i-tabler:arrows-minimize')
    expect(tooltipList[0].attributes('data-tooltip-title')).toBe('top.exitFullScreen')

    await actionButtons[0].trigger('click')

    expect(mocked.toggleFullScreenAction).toHaveBeenCalledTimes(1)
    expect(mocked.channelSend).not.toHaveBeenCalledWith(expect.objectContaining({
      event: 'full-screen',
    }))
  })

  it('全屏按钮应位于右上角功能区最左侧，且不打乱最小化/最大化/关闭顺序', () => {
    store.hasNewVersion = true
    const wrapper = mountLayoutTop()
    const html = wrapper.html()

    expect(html.indexOf('i-tabler:arrows-maximize')).toBeLessThan(html.indexOf('i-tabler:arrow-bar-up'))
    expect(html.indexOf('i-tabler:minus')).toBeLessThan(html.indexOf('i-tabler:crop-1-1'))
    expect(html.indexOf('i-tabler:crop-1-1')).toBeLessThan(html.indexOf('i-tabler:x'))
  })
})
