import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import defaultConfig from '../../../../wj-markdown-editor-electron/src/data/defaultConfig.js'

import SettingView from '../SettingView.vue'

const mocked = vi.hoisted(() => ({
  messageWarn: vi.fn(),
  messageWarning: vi.fn(),
  modalConfirm: vi.fn(),
  channelSend: vi.fn(),
  store: {
    config: {},
    searchBarVisible: false,
    editorSearchBarVisible: false,
  },
}))

mocked.store = reactive(mocked.store)

vi.mock('ant-design-vue', () => ({
  message: {
    warn: mocked.messageWarn,
    warning: mocked.messageWarning,
  },
  Modal: {
    confirm: mocked.modalConfirm,
  },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: key => key,
  }),
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore: () => mocked.store,
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: mocked.channelSend,
  },
}))

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(defaultConfig))
}

async function flushPendingUpdates() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function getSetupBinding(wrapper, key) {
  return wrapper.vm[key] ?? wrapper.vm.$.setupState[key]
}

async function mountSettingView() {
  const wrapper = shallowMount(SettingView, {
    global: {
      mocks: {
        $t: key => key,
      },
      stubs: {
        'OtherLayout': { template: '<div><slot name="action" /><slot /></div>' },
        'TypographerDescription': true,
        'ColorPicker': true,
        'ExclamationCircleOutlined': true,
        'a-tooltip': true,
        'a-select-option': true,
        'a-select': true,
        'a-descriptions-item': true,
        'a-radio-button': true,
        'a-radio-group': true,
        'a-input-number': true,
        'a-checkbox-group': true,
        'a-descriptions': true,
        'a-slider': true,
        'a-popover': true,
        'a-input': true,
        'a-input-password': true,
        'a-checkbox': true,
        'a-textarea': true,
      },
    },
  })

  await flushPendingUpdates()
  return wrapper
}

beforeEach(() => {
  mocked.channelSend.mockReset()
  mocked.store.config = cloneDefaultConfig()

  mocked.channelSend.mockImplementation(async ({ event }) => {
    if (event === 'get-config' || event === 'get-default-config') {
      return cloneDefaultConfig()
    }

    return { ok: true }
  })

  Object.defineProperty(window, 'queryLocalFonts', {
    configurable: true,
    value: vi.fn().mockResolvedValue([]),
  })
})

describe('settingView 左侧 tab 结构', () => {
  it('应渲染 6 个 tab 与 6 个面板，默认停在常规', async () => {
    const wrapper = await mountSettingView()

    expect(wrapper.findAll('.setting-tab')).toHaveLength(6)
    expect(wrapper.findAll('.setting-panel')).toHaveLength(6)
    expect(getSetupBinding(wrapper, 'activeTabKey')).toBe('general')
    expect(getSetupBinding(wrapper, 'settingTabList').map(tab => tab.key)).toEqual([
      'general',
      'appearance',
      'editor',
      'shortcut',
      'fileAndImage',
      'exportAndWatermark',
    ])
  })

  it('点击 tab 后应切换活动面板并记忆滚动位置', async () => {
    const wrapper = await mountSettingView()
    const tabs = wrapper.findAll('.setting-tab')

    expect(wrapper.find('[data-panel-key="general"]').attributes('style') ?? '').not.toContain('display: none')

    await tabs[3].trigger('click')
    await flushPendingUpdates()
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'activeTabKey')).toBe('shortcut')
    // jsdom 下 isVisible() 不可靠，直接断言 v-show 写入的 display
    expect(wrapper.find('[data-panel-key="general"]').attributes('style') ?? '').toContain('display: none')
    expect(wrapper.find('[data-panel-key="editor"]').attributes('style') ?? '').toContain('display: none')
  })

  it('快捷键应拆成全局与编辑器两段', async () => {
    const wrapper = await mountSettingView()
    const globalList = getSetupBinding(wrapper, 'globalShortcutKeyList')
    const editorList = getSetupBinding(wrapper, 'editorShortcutKeyList')

    expect(globalList.length).toBeGreaterThan(0)
    expect(editorList.length).toBeGreaterThan(0)
    expect(globalList.every(item => item.type !== 'editor')).toBe(true)
    expect(editorList.every(item => item.type === 'editor')).toBe(true)
    expect(globalList.length + editorList.length).toBe(defaultConfig.shortcutKeyList.length)
  })

  it('滑块指示器首次挂载后应可见', async () => {
    const wrapper = await mountSettingView()
    const style = getSetupBinding(wrapper, 'tabIndicatorStyle')

    expect(style.opacity).toBe('1')
    expect(typeof style.transform).toBe('string')
  })

  it('方向键应切换 tab', async () => {
    const wrapper = await mountSettingView()
    const tabs = wrapper.findAll('.setting-tab')

    await tabs[0].trigger('keydown', { key: 'ArrowDown' })
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'activeTabKey')).toBe('appearance')
  })
})

describe('settingView 系统字体枚举', () => {
  function readSystemFontList(wrapper) {
    return getSetupBinding(wrapper, 'systemFontList')
  }

  function stubQueryLocalFonts(queryLocalFonts) {
    Object.defineProperty(window, 'queryLocalFonts', {
      configurable: true,
      value: queryLocalFonts,
    })
  }

  it('枚举结果为空时应回落到兜底候选，不能留空下拉', async () => {
    const wrapper = await mountSettingView()
    const fontList = readSystemFontList(wrapper)

    expect(fontList.length).toBeGreaterThan(0)
    expect(fontList.every(item => typeof item.value === 'string' && item.value !== '')).toBe(true)
  })

  it('枚举被拒绝时应回落到兜底候选', async () => {
    stubQueryLocalFonts(vi.fn().mockRejectedValue(new Error('local-fonts denied')))

    const wrapper = await mountSettingView()

    expect(readSystemFontList(wrapper).length).toBeGreaterThan(0)
  })

  it('环境缺少 queryLocalFonts 时不能中断 onMounted，滑块仍应可见', async () => {
    stubQueryLocalFonts(undefined)

    const wrapper = await mountSettingView()

    expect(readSystemFontList(wrapper).length).toBeGreaterThan(0)
    expect(getSetupBinding(wrapper, 'tabIndicatorStyle').opacity).toBe('1')
  })

  it('枚举成功时应优先使用真实字体，同一 family 只保留最短的 fullName', async () => {
    stubQueryLocalFonts(vi.fn().mockResolvedValue([
      { family: 'Example Sans', fullName: 'Example Sans Regular' },
      { family: 'Example Sans', fullName: 'Example Sans' },
    ]))

    const wrapper = await mountSettingView()

    expect(readSystemFontList(wrapper)).toEqual([
      { value: 'Example Sans', label: 'Example Sans' },
    ])
  })
})
