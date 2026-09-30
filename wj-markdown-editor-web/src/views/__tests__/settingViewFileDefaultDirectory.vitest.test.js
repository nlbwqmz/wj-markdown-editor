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

async function flushPendingUpdates() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function getSetupBinding(wrapper, key) {
  return wrapper.vm[key] ?? wrapper.vm.$.setupState[key]
}

function getConfigUpdatePayloadList() {
  return mocked.channelSend.mock.calls
    .map(([payload]) => payload)
    .filter(payload => payload?.event === 'config.update')
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

describe('settingView 文件管理栏默认目录', () => {
  it('选择目录成功时必须走 fileDefaultDirectory 的 set mutation', async () => {
    const wrapper = await mountSettingView()
    const openFileDefaultDirSelect = getSetupBinding(wrapper, 'openFileDefaultDirSelect')

    mocked.channelSend.mockClear()
    mocked.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'open-dir-select') {
        return 'D:/notes'
      }

      return { ok: true }
    })

    await openFileDefaultDirSelect()
    await flushPendingUpdates()

    expect(mocked.channelSend).toHaveBeenCalledWith({ event: 'open-dir-select' })
    expect(getConfigUpdatePayloadList()).toEqual([
      {
        event: 'config.update',
        data: {
          operations: [
            {
              type: 'set',
              path: ['fileDefaultDirectory'],
              value: 'D:/notes',
            },
          ],
        },
      },
    ])
  })

  it('取消选择目录时不得提交配置变更', async () => {
    const wrapper = await mountSettingView()
    const openFileDefaultDirSelect = getSetupBinding(wrapper, 'openFileDefaultDirSelect')

    mocked.channelSend.mockClear()
    mocked.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'open-dir-select') {
        return undefined
      }

      return { ok: true }
    })

    await openFileDefaultDirSelect()
    await flushPendingUpdates()

    expect(getConfigUpdatePayloadList()).toEqual([])
  })

  it('清空默认目录时必须提交空字符串', async () => {
    const wrapper = await mountSettingView()
    const onNormalizedStringFieldChange = getSetupBinding(wrapper, 'onNormalizedStringFieldChange')

    mocked.channelSend.mockClear()

    await onNormalizedStringFieldChange(['fileDefaultDirectory'], undefined)
    await flushPendingUpdates()

    expect(getConfigUpdatePayloadList()).toEqual([
      {
        event: 'config.update',
        data: {
          operations: [
            {
              type: 'set',
              path: ['fileDefaultDirectory'],
              value: '',
            },
          ],
        },
      },
    ])
  })
})
