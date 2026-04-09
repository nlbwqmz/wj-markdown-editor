import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import MarkdownMenu from '../MarkdownMenu.vue'

vi.mock('@/util/commonUtil.js', () => ({
  default: {
    debounce(fn) {
      return fn
    },
  },
}))

function createAnchorList() {
  return [
    {
      key: 'intro',
      href: '#intro',
      title: '介绍',
      level: 1,
      children: [
        {
          key: 'session',
          href: '#session',
          title: '文档会话模型',
          level: 2,
          children: [],
        },
      ],
    },
    {
      key: 'resource',
      href: '#resource',
      title: '资源策略',
      level: 1,
      children: [],
    },
  ]
}

function createHeading({ container, top }) {
  return {
    getBoundingClientRect() {
      return {
        top: 100 + top - container.scrollTop,
      }
    },
  }
}

function createWrapper(props = {}) {
  return mount(MarkdownMenu, {
    props,
    attachTo: document.body,
    global: {
      mocks: {
        $t: key => key,
      },
      stubs: {
        'a-empty': {
          template: '<div data-testid="empty-stub"><slot name="description" /></div>',
        },
        'a-anchor': {
          template: '<div data-testid="anchor-stub" />',
        },
      },
    },
  })
}

function installRequestAnimationFrameStub() {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  let rafTimestamp = 0

  globalThis.requestAnimationFrame = (callback) => {
    return setTimeout(() => {
      rafTimestamp += 16
      callback(rafTimestamp)
    }, 16)
  }
  globalThis.cancelAnimationFrame = (id) => {
    clearTimeout(id)
  }

  return () => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
  }
}

describe('markdownMenu', () => {
  let container
  let secondaryContainer
  let scrollIntoViewSpy

  beforeEach(() => {
    container = document.createElement('div')
    container.scrollTop = 0
    Object.defineProperty(container, 'clientTop', {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(container, 'clientHeight', {
      configurable: true,
      value: 240,
    })
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 800,
    })
    container.getBoundingClientRect = () => ({ top: 100 })
    container.scrollTo = vi.fn(({ top }) => {
      container.scrollTop = top
    })
    secondaryContainer = document.createElement('div')
    secondaryContainer.scrollTop = 0
    Object.defineProperty(secondaryContainer, 'clientTop', {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(secondaryContainer, 'clientHeight', {
      configurable: true,
      value: 240,
    })
    Object.defineProperty(secondaryContainer, 'scrollHeight', {
      configurable: true,
      value: 800,
    })
    secondaryContainer.getBoundingClientRect = () => ({ top: 100 })
    secondaryContainer.scrollTo = vi.fn(({ top }) => {
      secondaryContainer.scrollTop = top
    })

    scrollIntoViewSpy = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewSpy,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('会按层级渲染目录项', async () => {
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    const items = wrapper.findAll('[data-testid="markdown-menu-item"]')
    expect(items).toHaveLength(3)
    expect(items[1].attributes('data-depth')).toBe('1')
    expect(items[0].attributes('data-level')).toBe('1')
    expect(items[0].attributes('style')).toContain('--wj-markdown-menu-font-size: 15px;')
    expect(items[0].attributes('style')).toContain('--wj-markdown-menu-font-weight: 600;')
    expect(items[1].attributes('style')).toContain('--wj-markdown-menu-font-size: 14px;')
    expect(items[1].attributes('style')).toContain('--wj-markdown-menu-font-weight: 600;')
    expect(items[0].classes()).toContain('cursor-pointer')
    expect(items[0].text()).toBe('介绍')
  })

  it('目录项应通过 title 保留完整标题文本，供悬浮时查看', async () => {
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    expect(wrapper.find('[data-href="#session"]').attributes('title')).toBe('文档会话模型')
  })

  it('空目录时会保留空状态', async () => {
    const wrapper = createWrapper({
      anchorList: [],
      getContainer: () => container,
    })

    expect(wrapper.find('[data-testid="empty-stub"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="markdown-menu-item"]')).toHaveLength(0)
  })

  it('预览容器滚动后会切换 active 项，并把 active 项滚入目录可视区', async () => {
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    container.scrollTop = 160
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#session')
    expect(scrollIntoViewSpy).toHaveBeenCalled()
  })

  it('点击目录项时会使用 JS 动画滚动到目标标题', async () => {
    vi.useFakeTimers()
    const restoreAnimationFrame = installRequestAnimationFrameStub()
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    await wrapper.find('[data-href="#resource"]').trigger('click')
    vi.advanceTimersByTime(500)
    await wrapper.vm.$nextTick()

    expect(container.scrollTo).toHaveBeenCalled()
    expect(container.scrollTo).toHaveBeenLastCalledWith({
      top: 260,
    })

    restoreAnimationFrame()
  })

  it('点击目录后滚动停在目标标题上方极小距离时，仍应高亮当前锚点', async () => {
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })
    container.scrollTo = vi.fn(({ top }) => {
      container.scrollTop = top - 1
    })

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    await wrapper.find('[data-href="#resource"]').trigger('click')
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#resource')
  })

  it('点击目录后的长距离滚动超过初始同步窗口时，最终轻微欠滚仍应保持当前锚点高亮', async () => {
    vi.useFakeTimers()
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })
    container.scrollTo = vi.fn()

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    await wrapper.find('[data-href="#resource"]').trigger('click')

    container.scrollTop = 80
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(350)

    container.scrollTop = 170
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(350)

    container.scrollTop = 230
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(350)

    container.scrollTop = 259
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#resource')
  })

  it('普通滚动停在目标标题上方极小距离时，应按 a-anchor 的 bounds 语义切换到当前锚点', async () => {
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    container.scrollTop = 259
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#resource')
  })

  it('点击目录后在程序化滚动进行中，滚动事件不应抢走当前点击项的高亮', async () => {
    vi.useFakeTimers()
    const restoreAnimationFrame = installRequestAnimationFrameStub()
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    await wrapper.find('[data-href="#resource"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#resource')

    container.scrollTop = 80
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#resource')

    restoreAnimationFrame()
  })

  it('预览滚动容器切换时，应按新容器的滚动位置重新计算 active 项', async () => {
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })
    secondaryContainer.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container: secondaryContainer, top: 0 }),
        '#session': createHeading({ container: secondaryContainer, top: 120 }),
        '#resource': createHeading({ container: secondaryContainer, top: 260 }),
      }
      return map[selector] || null
    })
    container.scrollTo = vi.fn(({ top }) => {
      container.scrollTop = top - 1
    })
    const containerRef = ref(container)

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => containerRef,
    })

    await wrapper.find('[data-href="#resource"]').trigger('click')
    secondaryContainer.scrollTop = 160
    containerRef.value = secondaryContainer
    await nextTick()
    await wrapper.vm.$nextTick()
    await nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#session')
  })

  it('预览滚动容器引用切换后，会重新绑定新的滚动监听并解绑旧容器', async () => {
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container, top: 0 }),
        '#session': createHeading({ container, top: 120 }),
        '#resource': createHeading({ container, top: 260 }),
      }
      return map[selector] || null
    })
    secondaryContainer.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ container: secondaryContainer, top: 0 }),
        '#session': createHeading({ container: secondaryContainer, top: 120 }),
        '#resource': createHeading({ container: secondaryContainer, top: 260 }),
      }
      return map[selector] || null
    })
    const containerRef = ref(container)

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => containerRef,
    })

    containerRef.value = secondaryContainer
    await nextTick()
    await wrapper.vm.$nextTick()

    secondaryContainer.scrollTop = 160
    secondaryContainer.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#session')

    container.scrollTop = 260
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#session')
  })
})
