import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import PreviewAssetContextMenu from '../PreviewAssetContextMenu.vue'

vi.mock('vue-i18n', () => ({
  useI18n() {
    return {
      t(key) {
        return key
      },
    }
  },
}))

vi.mock('@/util/editor/previewAssetContextMenuUtil.js', () => ({
  getPreviewAssetPopupContainer: vi.fn(() => document.body),
}))

// 这些桩组件只保留当前测试关心的点击、插槽和 danger 样式语义。
const DropdownStub = defineComponent({
  name: 'ADropdownStub',
  props: {
    open: {
      type: Boolean,
      default: false,
    },
    placement: {
      type: String,
      default: 'bottomLeft',
    },
    overlayClassName: {
      type: String,
      default: '',
    },
  },
  emits: ['openChange'],
  setup(props, { slots }) {
    return () => h('div', {
      'data-testid': 'dropdown-stub',
      'data-open': String(props.open),
      'data-placement': props.placement,
      'data-overlay-class-name': props.overlayClassName,
    }, [
      slots.default?.(),
      props.open
        ? h('div', {
            'class': props.overlayClassName,
            'data-testid': 'dropdown-overlay-stub',
          }, slots.overlay?.())
        : null,
    ])
  },
})

const MenuStub = defineComponent({
  name: 'AMenuStub',
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'menu-stub' }, slots.default?.())
  },
})

const MenuItemStub = defineComponent({
  name: 'AMenuItemStub',
  props: {
    danger: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { attrs, slots }) {
    return () => h('button', {
      'type': 'button',
      'class': ['menu-item-stub', props.danger ? 'menu-item-danger' : ''],
      'data-menu-key': attrs['data-menu-key'],
      'onClick': attrs.onClick,
    }, slots.default?.())
  },
})

function mountContextMenu(props = {}) {
  return mount(PreviewAssetContextMenu, {
    props: {
      open: true,
      x: 120,
      y: 160,
      items: [],
      ...props,
    },
    global: {
      stubs: {
        'a-dropdown': DropdownStub,
        'a-menu': MenuStub,
        'a-menu-item': MenuItemStub,
      },
    },
  })
}

// 统一复用全局关闭场景，避免每个用例重复挂载和清理逻辑。
async function dispatchAndCollectClose(eventTarget, event) {
  const wrapper = mountContextMenu({
    items: [
      {
        key: 'open-explorer',
        label: '打开目录',
      },
    ],
  })

  eventTarget.dispatchEvent(event)
  await nextTick()

  const closeEvents = wrapper.emitted('close') || []
  wrapper.unmount()
  return closeEvents.length
}

describe('previewAssetContextMenu', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('open=true 且只有一项菜单时，点击菜单项会发出对应 key 的 select 并关闭菜单', async () => {
    const wrapper = mountContextMenu({
      items: [
        {
          key: 'open-explorer',
          label: '打开目录',
        },
      ],
    })

    await wrapper.get('[data-menu-key="open-explorer"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['open-explorer']])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('危险项会带危险样式，普通项不会带危险样式', () => {
    const wrapper = mountContextMenu({
      items: [
        {
          key: 'open-explorer',
          label: '打开目录',
          danger: false,
        },
        {
          key: 'delete',
          label: '删除',
          danger: true,
        },
      ],
    })

    const normalItem = wrapper.get('[data-menu-key="open-explorer"]')
    const dangerItem = wrapper.get('[data-menu-key="delete"]')

    expect(normalItem.classes()).not.toContain('menu-item-danger')
    expect(dangerItem.classes()).toContain('menu-item-danger')
  })

  it('点击菜单外空白区域时会关闭菜单', async () => {
    const closeCount = await dispatchAndCollectClose(document.body, new MouseEvent('pointerdown', {
      bubbles: true,
    }))

    expect(closeCount).toBe(1)
  })

  it('再次在其他位置触发右键菜单时会关闭菜单', async () => {
    const closeCount = await dispatchAndCollectClose(document.body, new MouseEvent('contextmenu', {
      bubbles: true,
    }))

    expect(closeCount).toBe(1)
  })

  it('按下 Esc 时会关闭菜单', async () => {
    const closeCount = await dispatchAndCollectClose(window, new KeyboardEvent('keydown', {
      key: 'Escape',
    }))

    expect(closeCount).toBe(1)
  })

  it('滚动窗口时会关闭菜单', async () => {
    const closeCount = await dispatchAndCollectClose(window, new Event('scroll'))

    expect(closeCount).toBe(1)
  })

  it('窗口尺寸变化时会关闭菜单', async () => {
    const closeCount = await dispatchAndCollectClose(window, new Event('resize'))

    expect(closeCount).toBe(1)
  })
})
