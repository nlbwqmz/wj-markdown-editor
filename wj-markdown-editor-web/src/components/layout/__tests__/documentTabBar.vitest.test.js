import { flushPromises, mount } from '@vue/test-utils'
import { message } from 'ant-design-vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import {
  requestDocumentCloseTab,
  requestDocumentCloseTabs,
  requestDocumentRevealInFolder,
} from '@/util/document-session/rendererDocumentCommandUtil.js'
import DocumentTabBar from '../DocumentTabBar.vue'

const defaultTabs = [
  { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
  { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: true },
]

const store = reactive({
  documentSessionSnapshot: {
    activeSessionId: 'session-1',
    tabs: defaultTabs.map(tab => ({ ...tab })),
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

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentActivateTab: vi.fn(() => Promise.resolve()),
  requestDocumentCloseTab: vi.fn(() => Promise.resolve()),
  requestDocumentCloseTabs: vi.fn(() => Promise.resolve()),
  requestDocumentRevealInFolder: vi.fn(() => Promise.resolve({ ok: true })),
}))

// 组件直接用 ant-design-vue 的 message 给复制/打开目录反馈，这里只保留提示入口。
vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

// store 是模块级 reactive，测试之间必须重置，否则上一条用例改过的状态会污染下一条
beforeEach(() => {
  store.documentSessionSnapshot.activeSessionId = 'session-1'
  store.documentSessionSnapshot.tabs = defaultTabs.map(tab => ({ ...tab }))
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  })
})

/**
 * 标签栏只需要 dropdown 的默认插槽内容。
 *
 * 但 overlay 插槽必须一起渲染：ant-design-vue 的 Dropdown 只从 overlay 插槽取菜单内容，
 * 丢掉插槽的桩会让「右键菜单根本没挂上」这类缺陷完全不可见。
 */
function mountTabBar() {
  return mount(DocumentTabBar, {
    global: {
      stubs: {
        ADropdown: { template: '<div class="dropdown-stub"><slot /><slot name="overlay" /></div>' },
        AMenu: {
          name: 'AMenu',
          props: { items: { type: Array, default: () => [] } },
          template: `
            <div class="menu-stub">
              <template v-for="(item, index) in items" :key="item.key || 'divider-' + index">
                <span v-if="item.type === 'divider'" class="menu-stub__divider" data-testid="document-tab-menu-divider" />
                <span
                  v-else
                  class="menu-stub__item"
                  :data-menu-key="item.key"
                  :data-disabled="item.disabled ? 'true' : 'false'"
                >{{ item.label }}</span>
              </template>
            </div>
          `,
        },
      },
    },
  })
}

/**
 * 构造带指针字段的事件桩。
 *
 * jsdom 不做布局也不保证提供 PointerEvent，所以用普通 Event 补字段，
 * 只保留被测试代码真正读取的那几个。
 */
function createPointerEvent(type, { clientX = 0, pointerId = 1, button = 0 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    clientX: { value: clientX },
    pointerId: { value: pointerId },
    button: { value: button },
  })
  return event
}

/**
 * 给滚动容器写入假尺寸。
 *
 * jsdom 的 scrollWidth / clientWidth 恒为 0，不显式给出的话永远判不出「宽度不够」。
 */
function applyScrollerMetrics(scroller, { scrollWidth = 800, clientWidth = 400 } = {}) {
  Object.defineProperty(scroller, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(scroller, 'clientWidth', { value: clientWidth, configurable: true })
}

describe('documentTabBar overlay 滚动条', () => {
  it('标签栏不得使用原生滚动条，滚动能力必须落在独立的内层容器上', () => {
    const wrapper = mountTabBar()
    const tabBar = wrapper.get('[data-testid="document-tab-bar"]')
    const scroller = wrapper.get('[data-testid="document-tab-scroller"]')

    // 原生滚动条在 Chromium 里始终占位，标签栏自己不能再当滚动容器
    expect(tabBar.classes()).not.toContain('wj-scrollbar')
    expect(tabBar.classes()).not.toContain('overflow-x-auto')
    expect(scroller.classes()).toContain('overflow-x-auto')

    // 滑块是装饰层：必须脱离布局流
    expect(wrapper.get('[data-testid="document-tab-scrollbar-thumb"]').classes()).toContain('absolute')

    wrapper.unmount()
  })

  it('宽度足够时不得显示滑块', async () => {
    const wrapper = mountTabBar()
    const scroller = wrapper.get('[data-testid="document-tab-scroller"]').element
    await nextTick()

    applyScrollerMetrics(scroller, { scrollWidth: 400, clientWidth: 400 })
    scroller.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(wrapper.get('[data-testid="document-tab-scrollbar-thumb"]').isVisible()).toBe(false)

    wrapper.unmount()
  })

  it('宽度不够时只有鼠标进入标签栏才显示滑块', async () => {
    const wrapper = mountTabBar()
    const scroller = wrapper.get('[data-testid="document-tab-scroller"]').element
    await nextTick()

    applyScrollerMetrics(scroller)
    scroller.dispatchEvent(new Event('scroll'))
    await nextTick()

    const thumb = wrapper.get('[data-testid="document-tab-scrollbar-thumb"]')
    // 溢出即渲染，但默认透明，避免静止状态下出现多余的横条
    expect(thumb.isVisible()).toBe(true)
    expect(thumb.classes()).toContain('opacity-0')

    await wrapper.get('[data-testid="document-tab-bar"]').trigger('mouseenter')
    expect(thumb.classes()).toContain('opacity-100')

    await wrapper.get('[data-testid="document-tab-bar"]').trigger('mouseleave')
    expect(thumb.classes()).toContain('opacity-0')

    wrapper.unmount()
  })

  it('拖拽滑块必须按比例滚动内容，拖满可移距离就滚到末尾', async () => {
    const wrapper = mountTabBar()
    const scroller = wrapper.get('[data-testid="document-tab-scroller"]').element
    await nextTick()

    applyScrollerMetrics(scroller)
    scroller.dispatchEvent(new Event('scroll'))
    await nextTick()

    const thumb = wrapper.get('[data-testid="document-tab-scrollbar-thumb"]').element

    thumb.dispatchEvent(createPointerEvent('pointerdown', { clientX: 0 }))
    // 滑块宽 200、可移 200，内容可滚 400：拖 200px 应滚满 400px
    thumb.dispatchEvent(createPointerEvent('pointermove', { clientX: 200 }))
    expect(scroller.scrollLeft).toBe(400)

    thumb.dispatchEvent(createPointerEvent('pointerup', { clientX: 200 }))
    // 松手后继续移动不得再改变滚动位置
    thumb.dispatchEvent(createPointerEvent('pointermove', { clientX: 400 }))
    expect(scroller.scrollLeft).toBe(400)

    wrapper.unmount()
  })

  it('垂直滚轮在标签溢出时必须横向滚动内容并阻止默认行为', async () => {
    const wrapper = mountTabBar()
    const scroller = wrapper.get('[data-testid="document-tab-scroller"]').element
    await nextTick()

    applyScrollerMetrics(scroller)
    scroller.scrollLeft = 0

    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
    scroller.dispatchEvent(event)
    await nextTick()

    expect(scroller.scrollLeft).toBe(120)
    expect(event.defaultPrevented).toBe(true)

    wrapper.unmount()
  })

  it('触控板横向手势必须放行，不得与原生横滚叠加', async () => {
    const wrapper = mountTabBar()
    const scroller = wrapper.get('[data-testid="document-tab-scroller"]').element
    await nextTick()

    applyScrollerMetrics(scroller)
    scroller.scrollLeft = 0

    const event = new WheelEvent('wheel', { deltaX: 40, deltaY: 40, bubbles: true, cancelable: true })
    scroller.dispatchEvent(event)
    await nextTick()

    expect(scroller.scrollLeft).toBe(0)
    expect(event.defaultPrevented).toBe(false)

    wrapper.unmount()
  })
})

describe('documentTabBar 右键菜单', () => {
  it('菜单必须挂到 dropdown 的 overlay 插槽上，关闭类与文件类必须分组', () => {
    const wrapper = mountTabBar()

    // 每个标签一份菜单：ant-design-vue 的 Dropdown 只从 overlay 插槽取内容，
    // 用已失效的 `menu` prop 传菜单时这里会是 0
    const menuList = wrapper.findAll('.menu-stub')
    expect(menuList).toHaveLength(2)

    const firstMenuKeys = menuList[0]
      .findAll('.menu-stub__item')
      .map(item => item.attributes('data-menu-key'))
    expect(firstMenuKeys).toEqual([
      'close',
      'close-others',
      'close-left',
      'close-right',
      'copy-file-name',
      'copy-path',
      'reveal-in-explorer',
    ])

    // 关闭类与文件类之间必须有一条分隔线
    expect(menuList[0].findAll('[data-testid="document-tab-menu-divider"]')).toHaveLength(1)

    // 有 displayPath 的标签不禁止复制路径 / 在资源管理器中显示
    expect(menuList[0].get('[data-menu-key="copy-path"]').attributes('data-disabled')).toBe('false')
    expect(menuList[0].get('[data-menu-key="reveal-in-explorer"]').attributes('data-disabled')).toBe('false')

    wrapper.unmount()
  })

  it('点击菜单项必须作用在被右键的那个标签上，而不是活动标签', async () => {
    const wrapper = mountTabBar()

    // 第二个标签（session-2）是后台标签，活动标签是 session-1
    const secondMenu = wrapper.findAllComponents({ name: 'AMenu' })[1]
    await secondMenu.vm.$emit('click', { key: 'close' })

    expect(requestDocumentCloseTab).toHaveBeenCalledWith('session-2')

    wrapper.unmount()
  })

  it('关闭左侧必须只关左侧的干净标签', async () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: false },
      { sessionId: 'session-3', fileName: 'c.md', displayPath: 'D:/docs/c.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    // 对第三个标签执行「关闭左侧」→ 只关它左边两个
    const thirdMenu = wrapper.findAllComponents({ name: 'AMenu' })[2]
    await thirdMenu.vm.$emit('click', { key: 'close-left' })

    expect(requestDocumentCloseTabs).toHaveBeenCalledTimes(1)
    expect(requestDocumentCloseTabs).toHaveBeenCalledWith(['session-1', 'session-2'])
    expect(requestDocumentCloseTab).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('复制文件名成功后必须给出提示', async () => {
    const wrapper = mountTabBar()

    // 第二个标签（session-2）是后台标签，文件名是 b.md
    const secondMenu = wrapper.findAllComponents({ name: 'AMenu' })[1]
    await secondMenu.vm.$emit('click', { key: 'copy-file-name' })
    await flushPromises()

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('b.md')
    expect(message.success).toHaveBeenCalledWith('message.copySucceeded')

    wrapper.unmount()
  })

  it('复制路径成功后必须给出提示', async () => {
    const wrapper = mountTabBar()

    const firstMenu = wrapper.findAllComponents({ name: 'AMenu' })[0]
    await firstMenu.vm.$emit('click', { key: 'copy-path' })
    await flushPromises()

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('D:/docs/a.md')
    expect(message.success).toHaveBeenCalledWith('message.copySucceeded')

    wrapper.unmount()
  })

  it('在资源管理器中显示必须按被右键标签的路径请求，而不是活动标签', async () => {
    const wrapper = mountTabBar()

    // 第二个标签是后台标签，活动标签是 session-1
    const secondMenu = wrapper.findAllComponents({ name: 'AMenu' })[1]
    await secondMenu.vm.$emit('click', { key: 'reveal-in-explorer' })

    expect(requestDocumentRevealInFolder).toHaveBeenCalledWith('D:/docs/b.md')

    wrapper.unmount()
  })

  it('右侧标签全是脏状态时必须禁用关闭右侧', () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: true },
      { sessionId: 'session-3', fileName: 'c.md', displayPath: 'D:/docs/c.md', dirty: true },
    ]
    const wrapper = mountTabBar()

    const menu = wrapper.findAll('.menu-stub')[0]
    // 批量关闭会跳过脏标签，右侧没有可关的干净标签 → 必须置灰
    expect(menu.get('[data-menu-key="close-right"]').attributes('data-disabled')).toBe('true')
    expect(menu.get('[data-menu-key="close-left"]').attributes('data-disabled')).toBe('true')
    expect(menu.get('[data-menu-key="close-others"]').attributes('data-disabled')).toBe('true')

    wrapper.unmount()
  })

  it('左侧标签全是脏状态时必须禁用关闭左侧', () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: true },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: true },
      { sessionId: 'session-3', fileName: 'c.md', displayPath: 'D:/docs/c.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    const menu = wrapper.findAll('.menu-stub')[2]
    expect(menu.get('[data-menu-key="close-left"]').attributes('data-disabled')).toBe('true')
    expect(menu.get('[data-menu-key="close-right"]').attributes('data-disabled')).toBe('true')
    expect(menu.get('[data-menu-key="close-others"]').attributes('data-disabled')).toBe('true')

    wrapper.unmount()
  })

  it('一侧混有干净标签时关闭动作必须保持可用', () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: true },
      { sessionId: 'session-3', fileName: 'c.md', displayPath: 'D:/docs/c.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    const menu = wrapper.findAll('.menu-stub')[0]
    // 右侧 [脏, 干净]：至少有一个可关的干净标签
    expect(menu.get('[data-menu-key="close-right"]').attributes('data-disabled')).toBe('false')
    expect(menu.get('[data-menu-key="close-others"]').attributes('data-disabled')).toBe('false')

    wrapper.unmount()
  })

  it('只有一个标签时，关闭其他 / 关闭左侧 / 关闭右侧必须全部禁用', () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    const menu = wrapper.findAll('.menu-stub')[0]
    for (const key of ['close-others', 'close-left', 'close-right']) {
      expect(menu.get(`[data-menu-key="${key}"]`).attributes('data-disabled')).toBe('true')
    }
    // 关自己永远可用
    expect(menu.get('[data-menu-key="close"]').attributes('data-disabled')).toBe('false')

    wrapper.unmount()
  })

  it('第一个标签必须禁用关闭左侧，但保留关闭右侧', () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: false },
      { sessionId: 'session-3', fileName: 'c.md', displayPath: 'D:/docs/c.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    const menu = wrapper.findAll('.menu-stub')[0]
    expect(menu.get('[data-menu-key="close-left"]').attributes('data-disabled')).toBe('true')
    expect(menu.get('[data-menu-key="close-right"]').attributes('data-disabled')).toBe('false')
    expect(menu.get('[data-menu-key="close-others"]').attributes('data-disabled')).toBe('false')

    wrapper.unmount()
  })

  it('最后一个标签必须禁用关闭右侧，但保留关闭左侧', () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: false },
      { sessionId: 'session-3', fileName: 'c.md', displayPath: 'D:/docs/c.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    const menu = wrapper.findAll('.menu-stub')[2]
    expect(menu.get('[data-menu-key="close-right"]').attributes('data-disabled')).toBe('true')
    expect(menu.get('[data-menu-key="close-left"]').attributes('data-disabled')).toBe('false')
    expect(menu.get('[data-menu-key="close-others"]').attributes('data-disabled')).toBe('false')

    wrapper.unmount()
  })

  it('中间标签的关闭左侧与关闭右侧必须同时可用', () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: false },
      { sessionId: 'session-3', fileName: 'c.md', displayPath: 'D:/docs/c.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    const menu = wrapper.findAll('.menu-stub')[1]
    expect(menu.get('[data-menu-key="close-left"]').attributes('data-disabled')).toBe('false')
    expect(menu.get('[data-menu-key="close-right"]').attributes('data-disabled')).toBe('false')

    wrapper.unmount()
  })

  it('未命名标签必须禁用复制路径与在资源管理器中显示', () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'Untitled', displayPath: null, dirty: false },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    const menu = wrapper.findAll('.menu-stub')[0]
    expect(menu.get('[data-menu-key="copy-path"]').attributes('data-disabled')).toBe('true')
    expect(menu.get('[data-menu-key="reveal-in-explorer"]').attributes('data-disabled')).toBe('true')

    wrapper.unmount()
  })

  it('关闭其它必须跳过脏标签，不得把它们批量关掉', async () => {
    const wrapper = mountTabBar()

    // session-2 是脏标签，对 session-1 执行「关闭其它」时它必须被保留，
    // 过滤后关闭列表为空，因此不该发出任何请求
    const firstMenu = wrapper.findAllComponents({ name: 'AMenu' })[0]
    await firstMenu.vm.$emit('click', { key: 'close-others' })

    expect(requestDocumentCloseTabs).not.toHaveBeenCalled()
    expect(requestDocumentCloseTab).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('关闭右侧必须只发一次批量请求，不能逐个发 close-tab', async () => {
    // 三个干净标签，避免脏标签过滤干扰断言
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
      { sessionId: 'session-3', fileName: 'c.md', displayPath: 'D:/docs/c.md', dirty: false },
      { sessionId: 'session-4', fileName: 'd.md', displayPath: 'D:/docs/d.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    const firstMenu = wrapper.findAllComponents({ name: 'AMenu' })[0]
    await firstMenu.vm.$emit('click', { key: 'close-right' })

    expect(requestDocumentCloseTabs).toHaveBeenCalledTimes(1)
    expect(requestDocumentCloseTabs).toHaveBeenCalledWith(['session-3', 'session-4'])
    // 逐个关闭会让主进程每个命令都先激活目标，标签高亮会一路跳
    expect(requestDocumentCloseTab).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('关闭其它必须一次交出全部干净标签', async () => {
    store.documentSessionSnapshot.tabs = [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: true },
      { sessionId: 'session-3', fileName: 'c.md', displayPath: 'D:/docs/c.md', dirty: false },
      { sessionId: 'session-4', fileName: 'd.md', displayPath: 'D:/docs/d.md', dirty: false },
    ]
    const wrapper = mountTabBar()

    const firstMenu = wrapper.findAllComponents({ name: 'AMenu' })[0]
    await firstMenu.vm.$emit('click', { key: 'close-others' })

    // session-2 是脏标签必须排除，其余三个一次交出
    expect(requestDocumentCloseTabs).toHaveBeenCalledTimes(1)
    expect(requestDocumentCloseTabs).toHaveBeenCalledWith(['session-3', 'session-4'])

    wrapper.unmount()
  })
})

describe('documentTabBar 活动标签自动滚动', () => {
  /** 把标签与滚动容器的布局尺寸固定下来，jsdom 里这些值恒为 0。 */
  function applyTabLayout(wrapper, { tabLeft, tabWidth, clientWidth, scrollLeft = 0 }) {
    const scroller = wrapper.get('[data-testid="document-tab-scroller"]').element
    const tabElement = wrapper.get('[data-testid="document-tab-session-2"]').element

    Object.defineProperty(tabElement, 'offsetLeft', { value: tabLeft, configurable: true })
    Object.defineProperty(tabElement, 'offsetWidth', { value: tabWidth, configurable: true })
    Object.defineProperty(scroller, 'clientWidth', { value: clientWidth, configurable: true })
    scroller.scrollLeft = scrollLeft

    // jsdom 不实现 scrollTo
    scroller.scrollTo = vi.fn()

    return scroller
  }

  it('外部激活一个被裁的标签时，必须把它完整滚进可视区', async () => {
    store.documentSessionSnapshot.activeSessionId = 'session-1'
    const wrapper = mountTabBar()
    await nextTick()

    // 标签 500~600，可视区 0~400 → 右边缘被裁，目标 = 600 - 400 + 4
    const scroller = applyTabLayout(wrapper, { tabLeft: 500, tabWidth: 100, clientWidth: 400 })

    store.documentSessionSnapshot.activeSessionId = 'session-2'
    await vi.waitFor(() => {
      expect(scroller.scrollTo).toHaveBeenCalled()
    })

    // 首次定位已在挂载时完成，这里属于后续激活，走平滑滚动
    expect(scroller.scrollTo).toHaveBeenCalledWith({ left: 204, behavior: 'smooth' })

    wrapper.unmount()
  })

  it('外部激活一个完整可见的标签时不得滚动', async () => {
    store.documentSessionSnapshot.activeSessionId = 'session-1'
    const wrapper = mountTabBar()
    await nextTick()

    // 标签 100~200 完整落在可视区 0~400 内
    const scroller = applyTabLayout(wrapper, { tabLeft: 100, tabWidth: 100, clientWidth: 400 })

    store.documentSessionSnapshot.activeSessionId = 'session-2'
    await nextTick()
    await nextTick()

    expect(scroller.scrollTo).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('用户自己在标签栏点的标签不得触发补位移', async () => {
    store.documentSessionSnapshot.activeSessionId = 'session-1'
    const wrapper = mountTabBar()
    await nextTick()

    const scroller = applyTabLayout(wrapper, { tabLeft: 500, tabWidth: 100, clientWidth: 400 })

    await wrapper.get('[data-testid="document-tab-session-2"]').trigger('click')
    // 模拟主进程回推快照
    store.documentSessionSnapshot.activeSessionId = 'session-2'
    await nextTick()
    await nextTick()

    expect(scroller.scrollTo).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
