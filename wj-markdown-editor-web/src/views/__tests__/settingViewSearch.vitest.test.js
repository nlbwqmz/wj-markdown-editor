import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import defaultConfig from '../../../../wj-markdown-editor-electron/src/data/defaultConfig.js'
import zhCN from '../../i18n/zhCN.js'

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

// 使用真实 i18n 文案，保证中文关键词、双语 label 与分组名展开行为可被验证。
vi.mock('vue-i18n', async () => {
  const zhCNModule = await import('../../i18n/zhCN.js')
  const enUSModule = await import('../../i18n/enUS.js')

  function resolveMessageText(message, key) {
    return String(key).split('.').reduce((result, segment) => {
      if (result === undefined || result === null) {
        return undefined
      }
      return result[segment]
    }, message)
  }

  return {
    useI18n: () => ({
      t: (key, params, options) => {
        const message = options?.locale === 'en-US' ? enUSModule.default : zhCNModule.default
        return resolveMessageText(message, key) ?? key
      },
      locale: { value: 'zh-CN' },
    }),
  }
})

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

function resolveMessageText(message, key) {
  return String(key).split('.').reduce((result, segment) => {
    if (result === undefined || result === null) {
      return undefined
    }
    return result[segment]
  }, message)
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

function setSearchQuery(wrapper, value) {
  wrapper.vm.settingSearchQuery = value
}

function getPanelStyle(wrapper, tabKey) {
  return wrapper.find(`[data-panel-key="${tabKey}"]`).attributes('style') ?? ''
}

function getSectionStyle(wrapper, sectionId) {
  return wrapper.find(`[data-setting-section="${sectionId}"]`).attributes('style') ?? ''
}

async function mountSettingView() {
  const wrapper = shallowMount(SettingView, {
    global: {
      mocks: {
        $t: key => resolveMessageText(zhCN, key) ?? key,
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

  mocked.channelSend.mockImplementation(async () => {
    return { ok: true }
  })

  Object.defineProperty(window, 'queryLocalFonts', {
    configurable: true,
    value: vi.fn().mockResolvedValue([]),
  })
})

describe('settingView 设置项搜索', () => {
  it('默认态应保持当前 tab 选中并只显示对应面板', async () => {
    const wrapper = await mountSettingView()

    expect(getSetupBinding(wrapper, 'activeTabKey')).toBe('general')
    expect(wrapper.findAll('.setting-tab.is-active')).toHaveLength(1)
    expect(getPanelStyle(wrapper, 'general')).not.toContain('display: none')
    expect(getPanelStyle(wrapper, 'appearance')).toContain('display: none')
    expect(wrapper.find('.setting-search-empty').exists()).toBe(false)
  })

  it('输入搜索词后应取消 tab 选中、隐藏滑块并只显示命中面板', async () => {
    const wrapper = await mountSettingView()

    setSearchQuery(wrapper, '深色')
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'isSettingSearchActive')).toBe(true)
    expect(wrapper.findAll('.setting-tab.is-active')).toHaveLength(0)
    expect(getSetupBinding(wrapper, 'tabIndicatorStyle').opacity).toBe('0')

    const isSettingItemVisible = getSetupBinding(wrapper, 'isSettingItemVisible')
    expect(isSettingItemVisible('view.globalTheme')).toBe(true)
    expect(isSettingItemVisible('view.codeTheme')).toBe(false)

    expect(getPanelStyle(wrapper, 'appearance')).not.toContain('display: none')
    expect(getPanelStyle(wrapper, 'general')).toContain('display: none')
    expect(getSectionStyle(wrapper, 'view')).not.toContain('display: none')
    expect(getSectionStyle(wrapper, 'general')).toContain('display: none')
  })

  it('搜索无结果时应显示空态并隐藏全部面板', async () => {
    const wrapper = await mountSettingView()

    setSearchQuery(wrapper, 'zzz-不存在')
    await flushPendingUpdates()

    expect(wrapper.find('.setting-search-empty').exists()).toBe(true)
    expect(getSetupBinding(wrapper, 'settingSearchResultList')).toHaveLength(0)
    expect(getPanelStyle(wrapper, 'general')).toContain('display: none')
    expect(getPanelStyle(wrapper, 'exportAndWatermark')).toContain('display: none')
  })

  it('点击 tab 应清空搜索并选中目标 tab', async () => {
    const wrapper = await mountSettingView()

    setSearchQuery(wrapper, '深色')
    await flushPendingUpdates()

    const tabList = wrapper.findAll('.setting-tab')
    await tabList[1].trigger('click')
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'settingSearchQuery')).toBe('')
    expect(getSetupBinding(wrapper, 'activeTabKey')).toBe('appearance')
    expect(getSetupBinding(wrapper, 'isSettingSearchActive')).toBe(false)
    expect(wrapper.findAll('.setting-tab.is-active')).toHaveLength(1)
    expect(getPanelStyle(wrapper, 'appearance')).not.toContain('display: none')
  })

  it('手动清空搜索后应恢复搜索前的 tab', async () => {
    const wrapper = await mountSettingView()

    const tabList = wrapper.findAll('.setting-tab')
    await tabList[2].trigger('click')
    await flushPendingUpdates()
    expect(getSetupBinding(wrapper, 'activeTabKey')).toBe('editor')

    setSearchQuery(wrapper, '深色')
    await flushPendingUpdates()
    expect(wrapper.findAll('.setting-tab.is-active')).toHaveLength(0)

    setSearchQuery(wrapper, '')
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'activeTabKey')).toBe('editor')
    expect(wrapper.findAll('.setting-tab.is-active')).toHaveLength(1)
    expect(getPanelStyle(wrapper, 'editor')).not.toContain('display: none')
  })

  it('esc 应清空搜索框内容', async () => {
    const wrapper = await mountSettingView()

    setSearchQuery(wrapper, '深色')
    await flushPendingUpdates()

    await wrapper.find('.setting-tabs__search').trigger('keydown', { key: 'Escape' })
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'settingSearchQuery')).toBe('')
    expect(getSetupBinding(wrapper, 'isSettingSearchActive')).toBe(false)
  })

  it('搜索态下方向键应清空搜索并切换 tab', async () => {
    const wrapper = await mountSettingView()

    setSearchQuery(wrapper, '深色')
    await flushPendingUpdates()

    const tabList = wrapper.findAll('.setting-tab')
    await tabList[0].trigger('keydown', { key: 'ArrowDown' })
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'settingSearchQuery')).toBe('')
    expect(getSetupBinding(wrapper, 'activeTabKey')).toBe('appearance')
  })

  it('快捷键项应支持按 keymap 搜索', async () => {
    const wrapper = await mountSettingView()

    setSearchQuery(wrapper, 'ctrl+s')
    await flushPendingUpdates()

    const resultList = getSetupBinding(wrapper, 'settingSearchResultList')
    expect(resultList.length).toBeGreaterThan(0)
    expect(resultList[0].id).toBe('shortcut.save')
  })

  it('分组名完全相等时应展开该分组全部设置项', async () => {
    const wrapper = await mountSettingView()

    setSearchQuery(wrapper, '水印')
    await flushPendingUpdates()

    const resultList = getSetupBinding(wrapper, 'settingSearchResultList')
    expect(resultList).toHaveLength(11)
    expect(resultList[0].id).toBe('watermark.watermark')
    expect(getPanelStyle(wrapper, 'exportAndWatermark')).not.toContain('display: none')
    expect(getSectionStyle(wrapper, 'watermark')).not.toContain('display: none')
    expect(getSectionStyle(wrapper, 'export')).toContain('display: none')
  })

  it('搜索词变化时应把内容区滚动回顶部', async () => {
    const wrapper = await mountSettingView()

    const contentElement = wrapper.find('.setting-content').element
    contentElement.scrollTop = 120

    setSearchQuery(wrapper, '深色')
    await flushPendingUpdates()
    expect(contentElement.scrollTop).toBe(0)

    contentElement.scrollTop = 120
    setSearchQuery(wrapper, '深色主题')
    await flushPendingUpdates()
    expect(contentElement.scrollTop).toBe(0)
  })
})
