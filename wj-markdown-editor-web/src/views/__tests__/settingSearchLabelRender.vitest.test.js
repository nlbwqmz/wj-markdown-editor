import { mount } from '@vue/test-utils'
import { Descriptions, DescriptionsItem } from 'ant-design-vue'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'

// ant-design-vue 的响应式观察依赖 matchMedia，jsdom 默认没有实现。
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false
    },
  })
}

/**
 * 设置项搜索依赖两个 ant-design-vue 渲染事实：
 * 1. a-descriptions-item 的 label 支持 VNode，可在其中挂 data-setting-id 并渲染高亮片段；
 * 2. a-descriptions-item 自身不渲染 DOM，data-* / class 不会透传到表格行。
 * 这里用真实组件锁住这两个前提，antd 升级导致行为变化时能立即发现。
 */
describe('设置项搜索 label 渲染前提', () => {
  it('label VNode 应渲染 data-setting-id 与高亮片段', () => {
    const wrapper = mount({
      render() {
        return h(Descriptions, { bordered: true, column: 1 }, {
          default: () => [
            h(DescriptionsItem, {
              label: h('span', { 'data-setting-id': 'demo.item' }, [
                '示例',
                h('mark', { class: 'setting-search-hit' }, '项'),
              ]),
            }, { default: () => 'value' }),
          ],
        })
      },
    })

    expect(wrapper.find('[data-setting-id="demo.item"]').exists()).toBe(true)
    expect(wrapper.find('mark.setting-search-hit').text()).toBe('项')
    expect(wrapper.find('.ant-descriptions-item-label').text()).toContain('示例')
  })

  it('a-descriptions-item 上的 data 属性不应透传到 DOM', () => {
    const wrapper = mount({
      render() {
        return h(Descriptions, { bordered: true, column: 1 }, {
          default: () => [
            h(DescriptionsItem, { 'data-setting-id': 'should-drop' }, { default: () => 'value' }),
          ],
        })
      },
    })

    expect(wrapper.find('[data-setting-id="should-drop"]').exists()).toBe(false)
  })
})
