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
  viewMode: 'split',
  setViewMode: vi.fn(),
  config: {
    language: 'zh-CN',
    shortcutKeyList: [
      {
        id: 'viewSource',
        keymap: '',
        enabled: true,
      },
      {
        id: 'viewSplit',
        keymap: '',
        enabled: true,
      },
      {
        id: 'viewPreview',
        keymap: '',
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

function containsVNodeClass(content, expectedClass, visited = new Set()) {
  if (Array.isArray(content)) {
    return content.some(item => containsVNodeClass(item, expectedClass, visited))
  }

  if (!content || typeof content !== 'object') {
    return false
  }
  if (visited.has(content)) {
    return false
  }
  visited.add(content)

  const classValue = content.props?.class ?? ''
  const classList = Array.isArray(classValue) ? classValue.join(' ') : String(classValue)

  return classList.split(/\s+/u).includes(expectedClass) || containsVNodeClass(content.children, expectedClass, visited)
}

describe('layoutMenu full screen', () => {
  beforeEach(() => {
    store.isFullScreen = false
    store.recentList = []
    store.viewMode = 'split'
    store.config.language = 'zh-CN'
    store.config.shortcutKeyList = [
      {
        id: 'viewSource',
        keymap: '',
        enabled: true,
      },
      {
        id: 'viewSplit',
        keymap: '',
        enabled: true,
      },
      {
        id: 'viewPreview',
        keymap: '',
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
    store.setViewMode.mockReset()
  })

  it('视图菜单应依次提供三种视图模式项、分隔线与全屏项，并显示当前快捷键', () => {
    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const viewMenuChildren = getViewMenuChildren(wrapper)

    expect(extractTextFromNode(viewMenuChildren[0].label)).toContain('shortcutKey.viewSource')
    expect(extractTextFromNode(viewMenuChildren[1].label)).toContain('shortcutKey.viewSplit')
    expect(extractTextFromNode(viewMenuChildren[2].label)).toContain('shortcutKey.viewPreview')
    expect(viewMenuChildren[3].type).toBe('divider')
    expect(extractTextFromNode(viewMenuChildren[4].label)).toContain('topMenu.view.children.enterFullScreen')
    expect(extractTextFromNode(viewMenuChildren[4].label)).toContain('F11')
  })

  it('点击视图菜单中的三种视图模式项时应调用 store.setViewMode 对应模式', async () => {
    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const viewMenuChildren = getViewMenuChildren(wrapper)

    await viewMenuChildren[0].click()
    await viewMenuChildren[1].click()
    await viewMenuChildren[2].click()

    expect(store.setViewMode).toHaveBeenNthCalledWith(1, 'source')
    expect(store.setViewMode).toHaveBeenNthCalledWith(2, 'split')
    expect(store.setViewMode).toHaveBeenNthCalledWith(3, 'preview')
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

    expect(extractTextFromNode(getViewMenuChildren(wrapper)[4].label)).toContain('topMenu.view.children.exitFullScreen')

    store.isFullScreen = false
    await nextTick()

    expect(extractTextFromNode(getViewMenuChildren(wrapper)[4].label)).toContain('topMenu.view.children.enterFullScreen')
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

    await viewMenuChildren[4].click()

    expect(mocked.toggleFullScreenAction).toHaveBeenCalledTimes(1)
  })

  it('视图菜单组应统一预留勾选占位，并按当前视图模式打勾', () => {
    store.viewMode = 'split'

    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    const viewMenuChildren = getViewMenuChildren(wrapper)

    expect(containsVNodeClass(viewMenuChildren[0].label, 'i-tabler:check')).toBe(false)
    expect(containsVNodeClass(viewMenuChildren[0].label, 'inline-block')).toBe(true)
    expect(containsVNodeClass(viewMenuChildren[0].label, 'w-[1em]')).toBe(true)
    expect(containsVNodeClass(viewMenuChildren[1].label, 'i-tabler:check')).toBe(true)
    expect(containsVNodeClass(viewMenuChildren[2].label, 'i-tabler:check')).toBe(false)
    expect(containsVNodeClass(viewMenuChildren[2].label, 'inline-block')).toBe(true)
    expect(containsVNodeClass(viewMenuChildren[4].label, 'i-tabler:check')).toBe(false)
    expect(containsVNodeClass(viewMenuChildren[4].label, 'inline-block')).toBe(true)
    expect(containsVNodeClass(viewMenuChildren[5].label, 'inline-block')).toBe(true)
  })

  it('store.viewMode 变化后视图菜单勾选应同步更新', async () => {
    store.viewMode = 'split'

    const wrapper = shallowMount(LayoutMenu, {
      global: {
        stubs: {
          'a-dropdown': true,
          'a-menu': true,
        },
      },
    })

    store.viewMode = 'source'
    await nextTick()

    const viewMenuChildren = getViewMenuChildren(wrapper)

    expect(containsVNodeClass(viewMenuChildren[0].label, 'i-tabler:check')).toBe(true)
    expect(containsVNodeClass(viewMenuChildren[1].label, 'i-tabler:check')).toBe(false)
    expect(containsVNodeClass(viewMenuChildren[1].label, 'inline-block')).toBe(true)
  })
})
