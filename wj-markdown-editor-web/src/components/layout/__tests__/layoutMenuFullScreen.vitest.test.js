import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import LayoutMenu from '../LayoutMenu.vue'

const mocked = vi.hoisted(() => ({
  toggleFullScreenAction: vi.fn(),
  channelSend: vi.fn(),
  shortcutKeyHandler: vi.fn(),
}))

const store = reactive({
  isFullScreen: false,
  recentList: [],
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
    createId: vi.fn(() => 'mock-id'),
    createLabel: (label, shortcuts) => ({
      children: [label, shortcuts],
    }),
    createRecentLabel: (path, name) => ({
      children: [path, name],
    }),
    recentFileNotExists: vi.fn(),
  },
}))

vi.mock('@/util/fullScreenActionUtil.js', () => ({
  default: mocked.toggleFullScreenAction,
}))

vi.mock('@/util/shortcutKeyUtil.js', () => ({
  default: {
    getWebShortcutKeyHandler: mocked.shortcutKeyHandler,
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

function getViewMenuChildren(wrapper) {
  const menuList = getSetupBinding(wrapper, 'menuList')
  return menuList[1].children
}

describe('layoutMenu full screen', () => {
  beforeEach(() => {
    store.isFullScreen = false
    store.recentList = []
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
    mocked.toggleFullScreenAction.mockReset()
    mocked.channelSend.mockReset()
    mocked.shortcutKeyHandler.mockReset()
  })

  it('视图菜单应在切换项后新增全屏项，并显示当前快捷键', () => {
    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const viewMenuChildren = getViewMenuChildren(wrapper)

    expect(extractTextFromNode(viewMenuChildren[0].label)).toContain('topMenu.view.children.switchView')
    expect(extractTextFromNode(viewMenuChildren[1].label)).toContain('topMenu.view.children.enterFullScreen')
    expect(extractTextFromNode(viewMenuChildren[1].label)).toContain('F11')
  })

  it('store.isFullScreen 变化后应重建菜单文案', async () => {
    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    store.isFullScreen = true
    await nextTick()

    expect(extractTextFromNode(getViewMenuChildren(wrapper)[1].label)).toContain('topMenu.view.children.exitFullScreen')

    store.isFullScreen = false
    await nextTick()

    expect(extractTextFromNode(getViewMenuChildren(wrapper)[1].label)).toContain('topMenu.view.children.enterFullScreen')
  })

  it('点击视图菜单中的全屏项时应调用共享动作', async () => {
    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const viewMenuChildren = getViewMenuChildren(wrapper)

    await viewMenuChildren[1].click()

    expect(mocked.toggleFullScreenAction).toHaveBeenCalledTimes(1)
  })
})
