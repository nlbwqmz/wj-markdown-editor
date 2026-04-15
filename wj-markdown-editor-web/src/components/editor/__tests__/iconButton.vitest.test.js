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
