import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import IconButton from '../IconButton.vue'

const DropdownStub = defineComponent({
  name: 'ADropdownStub',
  props: {
    trigger: {
      type: Array,
      default: undefined,
    },
    arrow: {
      type: Boolean,
      default: false,
    },
    placement: {
      type: String,
      default: '',
    },
  },
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'dropdown-stub' }, [
      ...(slots.default?.() || []),
      ...(slots.overlay?.() || []),
    ])
  },
})

const MenuStub = defineComponent({
  name: 'AMenuStub',
  props: {
    items: {
      type: Array,
      default: () => [],
    },
    selectedKeys: {
      type: Array,
      default: undefined,
    },
  },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('div', { 'data-testid': 'menu-stub' }, props.items.map(item => h('button', {
      'type': 'button',
      'data-testid': `menu-item-${item.key}`,
      'onClick': () => emit('click', { key: item.key }),
    }, item.label)))
  },
})

const TooltipStub = defineComponent({
  name: 'ATooltipStub',
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'tooltip-stub' }, slots.default?.())
  },
})

function mountIconButton(props = {}) {
  return mount(IconButton, {
    props: {
      icon: 'i-tabler:test',
      label: 'test',
      ...props,
    },
    global: {
      stubs: {
        'a-dropdown': DropdownStub,
        'a-menu': MenuStub,
        'a-tooltip': TooltipStub,
        'a-popover': defineComponent({
          name: 'APopoverStub',
          setup(_popoverProps, { slots }) {
            return () => h('div', slots.default?.())
          },
        }),
      },
    },
  })
}

describe('iconButton', () => {
  it('默认应渲染 tooltip', () => {
    const wrapper = mountIconButton()

    expect(wrapper.find('[data-testid="tooltip-stub"]').exists()).toBe(true)
    expect(wrapper.find('i').exists()).toBe(true)
  })

  it('showTooltip 为 false 时普通按钮与下拉按钮均不应渲染 tooltip，但图标与菜单仍然可用', async () => {
    const menuAction = vi.fn()
    const plainButton = mountIconButton({ showTooltip: false })
    expect(plainButton.find('[data-testid="tooltip-stub"]').exists()).toBe(false)
    expect(plainButton.find('i').exists()).toBe(true)

    const dropdownButton = mountIconButton({
      showTooltip: false,
      menuList: [
        {
          key: 'sort-name',
          label: '名称排序',
          action: menuAction,
        },
      ],
    })
    expect(dropdownButton.find('[data-testid="tooltip-stub"]').exists()).toBe(false)
    expect(dropdownButton.findComponent(DropdownStub).exists()).toBe(true)

    await dropdownButton.get('[data-testid="menu-item-sort-name"]').trigger('click')
    expect(menuAction).toHaveBeenCalledTimes(1)
  })

  it('下拉按钮应透传 trigger 与 selectedKeys，并按菜单 key 执行动作', async () => {
    const menuAction = vi.fn()
    const wrapper = mountIconButton({
      menuList: [
        {
          key: 'modifiedTime-desc',
          label: '修改时间降序',
          action: menuAction,
        },
      ],
      menuTrigger: ['click'],
      menuSelectedKeys: ['modifiedTime-desc'],
    })

    expect(wrapper.findComponent(DropdownStub).props('trigger')).toEqual(['click'])
    expect(wrapper.findComponent(MenuStub).props('selectedKeys')).toEqual(['modifiedTime-desc'])

    await wrapper.get('[data-testid="menu-item-modifiedTime-desc"]').trigger('click')

    expect(menuAction).toHaveBeenCalledTimes(1)
  })
})
