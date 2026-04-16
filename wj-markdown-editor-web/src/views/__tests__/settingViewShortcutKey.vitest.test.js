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

vi.mock('@/util/searchBarController.js', () => ({
  previewSearchBarController: {
    close: vi.fn(),
  },
}))

vi.mock('@/util/searchBarLifecycleUtil.js', () => ({
  closeSearchBarIfVisible: vi.fn(),
}))

vi.mock('@/util/searchTargetBridgeUtil.js', () => ({
  createSearchTargetBridge: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
  }),
}))

vi.mock('@/util/searchTargetUtil.js', () => ({
  collectSearchTargetElements: vi.fn(() => []),
}))

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(defaultConfig))
}

function createKeyboardEvent(code, options = {}) {
  return {
    code,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...options,
  }
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
        'OtherLayout': true,
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
        'a-anchor': true,
        'a-affix': true,
      },
    },
  })

  await flushPendingUpdates()

  return wrapper
}

beforeEach(() => {
  mocked.messageWarn.mockReset()
  mocked.messageWarning.mockReset()
  mocked.modalConfirm.mockReset()
  mocked.channelSend.mockReset()
  mocked.store.config = cloneDefaultConfig()
  mocked.store.searchBarVisible = false
  mocked.store.editorSearchBarVisible = false

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

describe('settingView shortcut key input', () => {
  it('录入 F11 时会先阻止默认行为且不会命中保护快捷键冲突', async () => {
    const wrapper = await mountSettingView()
    const config = getSetupBinding(wrapper, 'config')
    const onKeydown = getSetupBinding(wrapper, 'onKeydown')
    const toggleFullScreenShortcutKey = config.shortcutKeyList.find(item => item.id === 'toggleFullScreen')
    const event = createKeyboardEvent('F11')

    onKeydown(toggleFullScreenShortcutKey)(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(toggleFullScreenShortcutKey.keymap).toBe('F11')
    expect(mocked.messageWarn).not.toHaveBeenCalled()
  })

  it('录入其他功能键单键时会阻止默认行为且不会被保护快捷键拦截', async () => {
    const wrapper = await mountSettingView()
    const config = getSetupBinding(wrapper, 'config')
    const onKeydown = getSetupBinding(wrapper, 'onKeydown')
    const saveOtherShortcutKey = config.shortcutKeyList.find(item => item.id === 'saveOther')
    const event = createKeyboardEvent('F5')

    onKeydown(saveOtherShortcutKey)(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(saveOtherShortcutKey.keymap).toBe('F5')
    expect(mocked.messageWarn).not.toHaveBeenCalled()
  })

  it('录入重复的功能键单键时仍然会先阻止默认行为再触发重复冲突校验', async () => {
    const wrapper = await mountSettingView()
    const config = getSetupBinding(wrapper, 'config')
    const onKeydown = getSetupBinding(wrapper, 'onKeydown')
    const saveShortcutKey = config.shortcutKeyList.find(item => item.id === 'save')
    const saveOtherShortcutKey = config.shortcutKeyList.find(item => item.id === 'saveOther')
    const event = createKeyboardEvent('F5')

    saveOtherShortcutKey.keymap = 'F5'

    onKeydown(saveShortcutKey)(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(saveShortcutKey.keymap).toBe('Ctrl+s')
    expect(mocked.messageWarn).toHaveBeenCalledTimes(1)
  })
})

describe('settingView 配置草稿同步', () => {
  it('外部更新 fileManagerSort 后，设置页后续提交必须沿用最新排序而不是回滚旧草稿', async () => {
    const wrapper = await mountSettingView()
    const config = getSetupBinding(wrapper, 'config')

    mocked.store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    await flushPendingUpdates()

    config.fileManagerVisible = !config.fileManagerVisible
    await flushPendingUpdates()

    const updateConfigCallList = mocked.channelSend.mock.calls
      .map(([payload]) => payload)
      .filter(payload => payload?.event === 'user-update-config')

    expect(updateConfigCallList).toHaveLength(1)
    expect(updateConfigCallList[0].data.fileManagerSort).toEqual({
      field: 'modifiedTime',
      direction: 'desc',
    })
  })
})
