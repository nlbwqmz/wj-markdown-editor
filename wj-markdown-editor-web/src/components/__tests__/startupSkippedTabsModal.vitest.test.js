import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import StartupSkippedTabsModal from '../StartupSkippedTabsModal.vue'

const channelState = vi.hoisted(() => ({ send: vi.fn() }))
const startupLoadingState = vi.hoisted(() => ({
  waitPromise: null,
  resolveWait: null,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key, params) => (params ? `${key}:${params.total}` : key),
  }),
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: channelState.send,
  },
}))

vi.mock('@/util/startupLoadingUtil.js', () => ({
  waitForStartupLoadingDismissed: () => startupLoadingState.waitPromise,
}))

const ModalStub = defineComponent({
  name: 'AModalStub',
  props: {
    open: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { slots }) {
    return () => (props.open
      ? h('div', { class: 'modal-stub' }, [
          h('div', { class: 'modal-title-stub' }, slots.title?.()),
          slots.default?.(),
          slots.footer?.(),
        ])
      : null)
  },
})

const ButtonStub = defineComponent({
  name: 'AButtonStub',
  setup(_, { slots }) {
    return () => h('button', { class: 'button-stub' }, slots.default?.())
  },
})

let wrapper = null

async function mountModal() {
  wrapper = mount(StartupSkippedTabsModal, {
    global: {
      stubs: {
        'a-modal': ModalStub,
        'a-button': ButtonStub,
      },
    },
  })
  await flushPromises()
  return wrapper
}

async function dismissStartupLoading() {
  startupLoadingState.resolveWait()
  await flushPromises()
}

describe('startupSkippedTabsModal', () => {
  beforeEach(() => {
    channelState.send.mockReset()
    startupLoadingState.waitPromise = new Promise((resolve) => {
      startupLoadingState.resolveWait = resolve
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('挂载后必须先拉取一次，但启动遮罩未移除前不得弹窗', async () => {
    channelState.send.mockResolvedValue(['D:/docs/a.md'])

    const mounted = await mountModal()

    expect(channelState.send).toHaveBeenCalledTimes(1)
    expect(channelState.send).toHaveBeenCalledWith({
      event: 'window.consume-startup-skipped-tabs',
    })
    expect(mounted.find('.modal-stub').exists()).toBe(false)
  })

  it('启动遮罩移除后必须弹窗并逐条列出路径', async () => {
    channelState.send.mockResolvedValue(['D:/docs/a.md', 'D:/docs/b.md'])

    const mounted = await mountModal()
    await dismissStartupLoading()

    expect(mounted.find('.modal-stub').exists()).toBe(true)
    // 标题必须带 warning 感叹号图标，与 Modal.warning 语义一致
    expect(mounted.find('.startup-skipped-tabs__title-icon').exists()).toBe(true)
    expect(mounted.find('.modal-title-stub').text()).toBe('prompt')
    expect(mounted.find('.startup-skipped-tabs__summary').text()).toBe('message.startupSkippedTabs:2')
    expect(mounted.findAll('.startup-skipped-tabs__item').map(item => item.text())).toEqual([
      'D:/docs/a.md',
      'D:/docs/b.md',
    ])
  })

  it('主进程返回空列表时遮罩移除后也不得弹窗', async () => {
    channelState.send.mockResolvedValue([])

    const mounted = await mountModal()
    await dismissStartupLoading()

    expect(mounted.find('.modal-stub').exists()).toBe(false)
  })

  it('列表里全是非法项时不得弹窗', async () => {
    channelState.send.mockResolvedValue(['', null, 42])

    const mounted = await mountModal()
    await dismissStartupLoading()

    expect(mounted.find('.modal-stub').exists()).toBe(false)
  })

  it('拉取失败时必须静默降级，不能影响编辑页', async () => {
    channelState.send.mockRejectedValue(new Error('ipc unavailable'))

    const mounted = await mountModal()
    await dismissStartupLoading()

    expect(mounted.find('.modal-stub').exists()).toBe(false)
  })

  it('点击确认按钮后必须关闭弹窗', async () => {
    channelState.send.mockResolvedValue(['D:/docs/a.md'])

    const mounted = await mountModal()
    await dismissStartupLoading()
    expect(mounted.find('.modal-stub').exists()).toBe(true)

    await mounted.find('.button-stub').trigger('click')

    expect(mounted.find('.modal-stub').exists()).toBe(false)
  })
})
