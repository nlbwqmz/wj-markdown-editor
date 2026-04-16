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

function createDeferred() {
  let resolve = null
  let reject = null
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
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

function getChannelPayloadList() {
  return mocked.channelSend.mock.calls.map(([payload]) => payload)
}

function getConfigUpdatePayloadList() {
  return getChannelPayloadList().filter(payload => payload?.event === 'config.update')
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

    await onKeydown(saveOtherShortcutKey)(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(getSetupBinding(wrapper, 'config').shortcutKeyList.find(item => item.id === 'saveOther')?.keymap).toBe('F5')
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
  it('外部更新 fileManagerSort 后，设置页本地草稿必须同步为最新排序', async () => {
    const wrapper = await mountSettingView()

    mocked.store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'config').fileManagerSort).toEqual({
      field: 'modifiedTime',
      direction: 'desc',
    })
  })

  it('同一字段连续提交时，较早的 update-config 广播不得覆盖较新的本地草稿', async () => {
    const wrapper = await mountSettingView()
    const onRecentMaxUpdate = getSetupBinding(wrapper, 'onRecentMaxUpdate')
    const firstDeferred = createDeferred()
    const secondDeferred = createDeferred()

    mocked.channelSend.mockImplementation(({ event }) => {
      if (event === 'get-config') {
        return Promise.resolve(cloneDefaultConfig())
      }

      if (event === 'config.update') {
        const nextDeferred = mocked.channelSend.mock.calls.filter(([payload]) => payload?.event === 'config.update').length === 1
          ? firstDeferred
          : secondDeferred
        return nextDeferred.promise
      }

      return Promise.resolve({ ok: true })
    })

    const firstSubmitPromise = onRecentMaxUpdate(11)
    const secondSubmitPromise = onRecentMaxUpdate(12)
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'config').recentMax).toBe(12)

    mocked.store.config = {
      ...cloneDefaultConfig(),
      recentMax: 11,
    }
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'config').recentMax).toBe(12)

    firstDeferred.resolve({
      ok: true,
      config: {
        ...cloneDefaultConfig(),
        recentMax: 11,
      },
    })
    await firstSubmitPromise
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'config').recentMax).toBe(12)

    secondDeferred.resolve({
      ok: true,
      config: {
        ...cloneDefaultConfig(),
        recentMax: 12,
      },
    })
    await secondSubmitPromise
    await flushPendingUpdates()

    expect(getSetupBinding(wrapper, 'config').recentMax).toBe(12)
  })
})

describe('settingView mutation 提交流程', () => {
  it('recentMax 修改必须走 config.update 的 set mutation，且不再发送 user-update-config', async () => {
    const wrapper = await mountSettingView()
    const onRecentMaxUpdate = getSetupBinding(wrapper, 'onRecentMaxUpdate')

    mocked.channelSend.mockClear()

    await onRecentMaxUpdate(7.9)
    await flushPendingUpdates()

    expect(getChannelPayloadList().some(payload => payload?.event === 'user-update-config')).toBe(false)
    expect(getConfigUpdatePayloadList()).toEqual([
      {
        event: 'config.update',
        data: {
          operations: [
            {
              type: 'set',
              path: ['recentMax'],
              value: 7,
            },
          ],
        },
      },
    ])
  })

  it('autoSave 修改必须走 setAutoSaveOption mutation', async () => {
    const wrapper = await mountSettingView()
    const onAutoSaveUpdate = getSetupBinding(wrapper, 'onAutoSaveUpdate')

    mocked.channelSend.mockClear()

    await onAutoSaveUpdate(['blur'])
    await flushPendingUpdates()

    expect(getConfigUpdatePayloadList()).toEqual([
      {
        event: 'config.update',
        data: {
          operations: [
            {
              type: 'setAutoSaveOption',
              option: 'blur',
              enabled: true,
            },
          ],
        },
      },
    ])
  })

  it('快捷键启用状态修改必须走 setShortcutKeyField mutation', async () => {
    const wrapper = await mountSettingView()
    const config = getSetupBinding(wrapper, 'config')
    const onShortcutKeyEnabledUpdate = getSetupBinding(wrapper, 'onShortcutKeyEnabledUpdate')
    const saveShortcutKey = config.shortcutKeyList.find(item => item.id === 'save')

    mocked.channelSend.mockClear()

    await onShortcutKeyEnabledUpdate(saveShortcutKey, false)
    await flushPendingUpdates()

    expect(getConfigUpdatePayloadList()).toEqual([
      {
        event: 'config.update',
        data: {
          operations: [
            {
              type: 'setShortcutKeyField',
              id: 'save',
              field: 'enabled',
              value: false,
            },
          ],
        },
      },
    ])
  })

  it('录入快捷键后必须走 setShortcutKeyField keymap mutation', async () => {
    const wrapper = await mountSettingView()
    const config = getSetupBinding(wrapper, 'config')
    const onKeydown = getSetupBinding(wrapper, 'onKeydown')
    const saveOtherShortcutKey = config.shortcutKeyList.find(item => item.id === 'saveOther')
    const event = createKeyboardEvent('F5')

    mocked.channelSend.mockClear()

    onKeydown(saveOtherShortcutKey)(event)
    await flushPendingUpdates()

    expect(getConfigUpdatePayloadList()).toEqual([
      {
        event: 'config.update',
        data: {
          operations: [
            {
              type: 'setShortcutKeyField',
              id: 'saveOther',
              field: 'keymap',
              value: 'F5',
            },
          ],
        },
      },
    ])
  })

  it('reset 必须单独发送 reset mutation，且不再先取默认配置后整份提交', async () => {
    const wrapper = await mountSettingView()
    const reset = getSetupBinding(wrapper, 'reset')

    mocked.channelSend.mockClear()

    reset()
    const confirmOptions = mocked.modalConfirm.mock.calls[0][0]
    await confirmOptions.onOk()
    await flushPendingUpdates()

    expect(getChannelPayloadList().some(payload => payload?.event === 'get-default-config')).toBe(false)
    expect(getConfigUpdatePayloadList()).toEqual([
      {
        event: 'config.update',
        data: {
          operations: [
            {
              type: 'reset',
            },
          ],
        },
      },
    ])
  })
})
