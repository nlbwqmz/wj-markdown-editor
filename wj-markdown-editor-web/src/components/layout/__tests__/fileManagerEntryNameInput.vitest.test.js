import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import FileManagerEntryNameInput from '../FileManagerEntryNameInput.vue'

const mountedWrapperList = []

function mountEntryNameInput(props = {}) {
  const wrapper = mount(FileManagerEntryNameInput, {
    props,
    attachTo: document.body,
  })
  mountedWrapperList.push(wrapper)
  return wrapper
}

async function simulateComposition(input, text) {
  await input.trigger('compositionstart')
  input.element.value = text
  await input.trigger('input')
  await input.trigger('compositionend')
  await nextTick()
}

afterEach(() => {
  while (mountedWrapperList.length > 0) {
    mountedWrapperList.pop().unmount()
  }
})

describe('fileManagerEntryNameInput', () => {
  it('挂载后应程序化聚焦输入框，且不依赖 DOM autofocus 属性', async () => {
    const wrapper = mountEntryNameInput({
      kind: 'folder',
    })
    await nextTick()

    const input = wrapper.find('input')
    expect(input.attributes('autofocus')).toBeUndefined()
    expect(document.activeElement).toBe(input.element)
  })

  it('中文输入法组合结束后应保留输入文本，并同步对外抛出最新值', async () => {
    const wrapper = mountEntryNameInput({
      kind: 'folder',
    })
    const input = wrapper.find('input')

    await simulateComposition(input, '你好')

    expect(input.element.value).toBe('你好')
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['你好'])
  })

  it('常规键盘输入应持续同步对外抛出最新值', async () => {
    const wrapper = mountEntryNameInput({
      kind: 'folder',
    })
    const input = wrapper.find('input')

    await input.setValue('assets')
    await nextTick()

    expect(input.element.value).toBe('assets')
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['assets'])
  })

  it('新建 Markdown 时应固定展示 .md 后缀', () => {
    const wrapper = mountEntryNameInput({
      kind: 'markdown',
    })

    expect(wrapper.find('.ant-input-group-addon').text()).toBe('.md')
  })

  it('新建文件夹时不应展示 .md 后缀', () => {
    const wrapper = mountEntryNameInput({
      kind: 'folder',
    })

    expect(wrapper.find('.ant-input-group-addon').exists()).toBe(false)
  })
})
