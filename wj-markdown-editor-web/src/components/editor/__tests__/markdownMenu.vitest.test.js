import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import IconButton from '../IconButton.vue'
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

function createHeading({ container, top, id }) {
  return {
    id,
    getAttribute(attributeName) {
      if (attributeName === 'name') {
        return null
      }

      return null
    },
    getBoundingClientRect() {
      return {
        top: 100 + top - container.scrollTop,
      }
    },
  }
}

function createHeadingTargetMap(container) {
  return {
    '#intro': createHeading({ container, top: 0, id: 'intro' }),
    '#session': createHeading({ container, top: 120, id: 'session' }),
    '#resource': createHeading({ container, top: 260, id: 'resource' }),
  }
}

function installHeadingTargets(container) {
  const headingTargetMap = createHeadingTargetMap(container)
  container.querySelector = vi.fn(selector => headingTargetMap[selector] || null)
  container.querySelectorAll = vi.fn(() => Object.values(headingTargetMap))
  return headingTargetMap
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
    installHeadingTargets(container)

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
    installHeadingTargets(container)

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    expect(wrapper.find('[data-href="#session"]').attributes('title')).toBe('文档会话模型')
  })

  it('目录映射刷新遇到未命中的非法 CSS 锚点时，不应因选择器回退而抛异常', () => {
    container.querySelectorAll = vi.fn(() => [])

    expect(() => {
      createWrapper({
        anchorList: [
          {
            key: 'encoded-cn-heading',
            href: '#2024%E6%80%BB%E7%BB%93',
            title: '2024总结',
            level: 1,
            children: [],
          },
        ],
        getContainer: () => container,
      })
    }).not.toThrow()
  })

  it('目录映射刷新遇到未命中的原始中文数字锚点时，不应在挂载阶段抛出选择器异常', () => {
    container.querySelectorAll = vi.fn(() => [])

    expect(() => {
      createWrapper({
        anchorList: [
          {
            key: 'raw-cn-heading',
            href: '#2024总结',
            title: '2024总结',
            level: 1,
            children: [],
          },
        ],
        getContainer: () => container,
      })
    }).not.toThrow()
  })

  it('空目录时会保留空状态', async () => {
    const wrapper = createWrapper({
      anchorList: [],
      getContainer: () => container,
    })

    expect(wrapper.find('[data-testid="empty-stub"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="markdown-menu-item"]')).toHaveLength(0)
  })

  it('默认会显示标题栏，并在可关闭时复用 IconButton 作为关闭入口', async () => {
    installHeadingTargets(container)

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
      close: vi.fn(),
    })

    expect(wrapper.text()).toContain('outline')
    expect(wrapper.findComponent(IconButton).exists()).toBe(true)
  })

  it('showHeader 为 false 时不显示标题栏，但仍保留目录内容', async () => {
    installHeadingTargets(container)

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
      close: vi.fn(),
      showHeader: false,
    })

    expect(wrapper.text()).not.toContain('outline')
    expect(wrapper.findComponent(IconButton).exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="markdown-menu-item"]')).toHaveLength(3)
  })

  it('预览容器滚动后会切换 active 项，并把 active 项滚入目录可视区', async () => {
    installHeadingTargets(container)

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

  it('点击目录项时应直接跳转到目标标题位置，不使用滚动动画', async () => {
    installHeadingTargets(container)

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    await wrapper.find('[data-href="#resource"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(container.scrollTo).toHaveBeenCalled()
    expect(container.scrollTo).toHaveBeenLastCalledWith({
      top: 260,
    })
  })

  it('点击目录后滚动停在目标标题上方极小距离时，仍应高亮当前锚点', async () => {
    installHeadingTargets(container)
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
    const restoreAnimationFrame = installRequestAnimationFrameStub()
    installHeadingTargets(container)
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
    restoreAnimationFrame()
  })

  it('普通滚动停在目标标题上方极小距离时，应按 a-anchor 的 bounds 语义切换到当前锚点', async () => {
    installHeadingTargets(container)

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
    installHeadingTargets(container)
    container.scrollTo = vi.fn()

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

  it('目录点击命中底部被浏览器 clamp 时，应结束程序化滚动保护并恢复后续手动滚动联动', async () => {
    installHeadingTargets(container)
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 400,
    })
    container.scrollTo = vi.fn(({ top }) => {
      const maxScrollTop = container.scrollHeight - container.clientHeight
      container.scrollTop = Math.min(top, maxScrollTop)
    })

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    await wrapper.find('[data-href="#resource"]').trigger('click')
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#resource')

    container.scrollTop = 0
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#intro')
  })

  it('向上点击目录时，中途滚动事件不应提前释放保护并把高亮抢回旧章节', async () => {
    installHeadingTargets(container)
    container.scrollTop = 260
    container.scrollTo = vi.fn()

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#resource')

    await wrapper.find('[data-href="#intro"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#intro')

    container.scrollTop = 220
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active="true"]').attributes('data-href')).toBe('#intro')
  })

  it('预览滚动容器切换时，应按新容器的滚动位置重新计算 active 项', async () => {
    installHeadingTargets(container)
    installHeadingTargets(secondaryContainer)
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
    installHeadingTargets(container)
    installHeadingTargets(secondaryContainer)
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

  it('目录滚动联动应复用已建立的标题映射，不在每次 scroll 时重复全量扫描预览 DOM', async () => {
    installHeadingTargets(container)

    const wrapper = createWrapper({
      anchorList: createAnchorList(),
      getContainer: () => container,
    })

    const initialQuerySelectorAllCallCount = container.querySelectorAll.mock.calls.length

    container.scrollTop = 120
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    container.scrollTop = 260
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(container.querySelectorAll).toHaveBeenCalledTimes(initialQuerySelectorAllCallCount)
  })
})
