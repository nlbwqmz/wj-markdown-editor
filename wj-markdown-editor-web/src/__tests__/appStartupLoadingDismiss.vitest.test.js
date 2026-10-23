import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STARTUP_LOADING_DISMISSED_EVENT, STARTUP_LOADING_READY_EVENT } from '@/util/startupLoadingUtil.js'
import App from '../App.vue'

const mocked = vi.hoisted(() => ({
  store: {
    config: {
      theme: { global: 'light' },
      fontSize: 16,
      language: 'zh-CN',
      fontFamily: {
        editArea: '',
        otherArea: '',
        previewArea: '',
        codeArea: '',
      },
    },
    searchBarVisible: false,
    editorSearchBarVisible: false,
  },
}))

vi.mock('ant-design-vue', () => ({
  px2remTransformer: () => ({}),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: { value: 'zh-CN' } }),
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore: () => mocked.store,
}))

vi.mock('@/router/index.js', () => ({
  default: {
    currentRoute: { value: { name: 'editor' } },
  },
}))

vi.mock('@/components/SearchBar.vue', () => ({
  default: {
    name: 'SearchBarStub',
    template: '<div data-testid="search-bar-stub" />',
  },
}))

vi.mock('@/util/searchBarController.js', () => ({
  previewSearchBarController: {
    close: vi.fn(),
  },
}))

vi.mock('@/util/shortcutKeyUtil.js', () => ({
  default: {
    isShortcutKey: vi.fn(() => false),
    getShortcutKey: vi.fn(() => ''),
  },
}))

// 构造与 index.html 中一致的启动遮罩结构（含子元素），验证移除逻辑不再依赖子元素与动画事件。
function createStartupLoadingElement() {
  const startupLoading = document.createElement('div')
  startupLoading.id = 'startup-loading'
  const icon = document.createElement('img')
  startupLoading.appendChild(icon)
  document.body.appendChild(startupLoading)
  return startupLoading
}

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        'a-style-provider': true,
        'a-config-provider': true,
        'router-view': true,
        'StartupSkippedTabsModal': true,
      },
    },
  })
}

describe('app startup loading dismiss', () => {
  beforeEach(() => {
    // 屏蔽 App 中 15 秒兜底定时器，避免测试进程残留真实定时器。
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    document.getElementById('startup-loading')?.remove()
    vi.clearAllMocks()
  })

  it('就绪事件触发后应立即移除启动遮罩，而不是等待淡出动画结束', () => {
    createStartupLoadingElement()
    const wrapper = mountApp()
    const dismissedHandler = vi.fn()
    window.addEventListener(STARTUP_LOADING_DISMISSED_EVENT, dismissedHandler)
    expect(document.getElementById('startup-loading')).not.toBeNull()

    window.dispatchEvent(new CustomEvent(STARTUP_LOADING_READY_EVENT))

    // 旧实现会等待 250ms 淡出动画的 animationend 才移除；新实现必须在事件派发后同步移除。
    expect(document.getElementById('startup-loading')).toBeNull()
    // 遮罩真正移除后必须广播一次，供“等遮罩消失再出现”的启动期 UI 消费
    expect(dismissedHandler).toHaveBeenCalledTimes(1)
    // 遮罩移除后不应再触发一次动画等待：推进动画时长后仍保持移除状态。
    vi.advanceTimersByTime(500)
    expect(document.getElementById('startup-loading')).toBeNull()

    window.removeEventListener(STARTUP_LOADING_DISMISSED_EVENT, dismissedHandler)
    wrapper.unmount()
  })

  it('重复派发就绪事件不应重复广播遮罩已移除事件', () => {
    createStartupLoadingElement()
    const wrapper = mountApp()
    const dismissedHandler = vi.fn()
    window.addEventListener(STARTUP_LOADING_DISMISSED_EVENT, dismissedHandler)

    window.dispatchEvent(new CustomEvent(STARTUP_LOADING_READY_EVENT))
    window.dispatchEvent(new CustomEvent(STARTUP_LOADING_READY_EVENT))

    expect(dismissedHandler).toHaveBeenCalledTimes(1)

    window.removeEventListener(STARTUP_LOADING_DISMISSED_EVENT, dismissedHandler)
    wrapper.unmount()
  })

  it('重复派发就绪事件不应抛错', () => {
    createStartupLoadingElement()
    const wrapper = mountApp()

    window.dispatchEvent(new CustomEvent(STARTUP_LOADING_READY_EVENT))

    expect(() => window.dispatchEvent(new CustomEvent(STARTUP_LOADING_READY_EVENT))).not.toThrow()
    expect(document.getElementById('startup-loading')).toBeNull()

    wrapper.unmount()
  })

  it('遮罩不存在时派发就绪事件不应抛错', () => {
    const wrapper = mountApp()

    expect(() => window.dispatchEvent(new CustomEvent(STARTUP_LOADING_READY_EVENT))).not.toThrow()

    wrapper.unmount()
  })
})
