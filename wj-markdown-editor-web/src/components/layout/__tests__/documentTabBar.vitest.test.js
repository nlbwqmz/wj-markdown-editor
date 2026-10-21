import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import DocumentTabBar from '../DocumentTabBar.vue'

const store = reactive({
  documentSessionSnapshot: {
    activeSessionId: 'session-1',
    tabs: [
      { sessionId: 'session-1', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
      { sessionId: 'session-2', fileName: 'b.md', displayPath: 'D:/docs/b.md', dirty: true },
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

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentActivateTab: vi.fn(() => Promise.resolve()),
  requestDocumentCloseTab: vi.fn(() => Promise.resolve()),
}))

/**
 * 标签栏只需要 dropdown 的默认插槽内容；右键菜单不是本测试的关注点，
 * 所以用最小桩替代 ant-design-vue 的全局组件。
 */
function mountTabBar() {
  return mount(DocumentTabBar, {
    global: {
      stubs: {
        ADropdown: { template: '<div><slot /></div>' },
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
