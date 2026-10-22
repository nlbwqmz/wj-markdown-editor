<script setup>
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { computed, createVNode, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ColorPicker from '@/components/AsyncColorPicker.js'
import OtherLayout from '@/components/layout/OtherLayout.vue'
import TopBarActionButton from '@/components/layout/TopBarActionButton.vue'
import TypographerDescription from '@/components/TypographerDescription.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import {
  cloneConfigDraft,
  normalizeRecentMaxInputValue,
} from '@/util/config/settingConfigDraftUtil.js'
import { createSettingConfigMutationController } from '@/util/config/settingConfigMutationController.js'
import constant from '@/util/constant.js'
import { resolveLanguagePreference } from '@/util/languagePreferenceUtil.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'
import { notifyFirstScreenReady } from '@/util/startupLoadingUtil.js'

const { t } = useI18n()

const store = useCommonStore()

const config = ref()
const settingContainerRef = ref()

const systemFontList = ref([])

const imageBedUploaderList = ref([
  { value: 'github', name: 'GitHub' },
  { value: 'smms', name: 'SM.MS' },
])

const autoSaveOptionList = computed(() => [
  {
    label: t('config.general.autoSaveOption.onWindowBlur'),
    value: 'blur',
  },
  {
    label: t('config.general.autoSaveOption.onWindowClose'),
    value: 'close',
  },
  {
    label: t('config.general.autoSaveOption.onTabSwitch'),
    value: 'switch',
  },
])

const externalFileChangeStrategyOptionList = computed(() => [
  {
    label: t('config.general.externalFileChangeStrategyOption.apply'),
    value: 'apply',
  },
  {
    label: t('config.general.externalFileChangeStrategyOption.prompt'),
    value: 'prompt',
  },
])

const codeThemeList = constant.codeThemeList
const previewThemeList = constant.previewThemeList
const settingConfigMutationController = createSettingConfigMutationController({
  getStoreConfig: () => store.config,
  setDraftConfig(nextConfig) {
    config.value = cloneConfigDraft(nextConfig)
  },
  showWarningMessage(messageKey) {
    message.warning(t(messageKey))
  },
})

settingConfigMutationController.syncStoreConfig(store.config)

/**
 * 左侧 tab 栏配置。顺序即展示顺序：功能域相邻的分组放在一起。
 */
const settingTabList = computed(() => [
  { key: 'general', label: t('config.title.general'), icon: 'i-tabler:adjustments-horizontal' },
  { key: 'appearance', label: t('config.title.appearance'), icon: 'i-tabler:palette' },
  { key: 'editor', label: t('config.title.editor'), icon: 'i-tabler:code' },
  { key: 'shortcut', label: t('config.title.shortcut'), icon: 'i-tabler:keyboard' },
  { key: 'fileAndImage', label: t('config.title.fileAndImage'), icon: 'i-tabler:folder' },
  { key: 'exportAndWatermark', label: t('config.title.exportAndWatermark'), icon: 'i-tabler:download' },
])

// 每次打开设置页都回到常规，不做上次 tab 记忆。
const activeTabKey = ref('general')
const contentRef = ref()
const tabIndicatorStyle = ref({ opacity: '0' })
const tabIndicatorReady = ref(false)
const tabButtonMap = new Map()
const tabScrollTopMap = new Map()

// 快捷键按 type 拆成全局与编辑器两段；缺失 type 的旧配置按全局处理。
const globalShortcutKeyList = computed(() => {
  const list = config.value?.shortcutKeyList ?? []
  return list.filter(item => item.type !== 'editor')
})

const editorShortcutKeyList = computed(() => {
  const list = config.value?.shortcutKeyList ?? []
  return list.filter(item => item.type === 'editor')
})

function setTabButtonRef(key, element) {
  if (element) {
    tabButtonMap.set(key, element)
    return
  }
  tabButtonMap.delete(key)
}

/**
 * 滑块位置依赖真实 DOM 高度，字号变化、语言切换、窗口缩放后都要重算。
 */
function syncTabIndicator() {
  const activeButton = tabButtonMap.get(activeTabKey.value)
  if (!activeButton) {
    tabIndicatorStyle.value = { opacity: '0' }
    return
  }

  tabIndicatorStyle.value = {
    opacity: '1',
    transform: `translateY(${activeButton.offsetTop}px)`,
    height: `${activeButton.offsetHeight}px`,
  }
}

async function activateTab(key) {
  if (key === activeTabKey.value || !settingTabList.value.some(tab => tab.key === key)) {
    return
  }

  tabScrollTopMap.set(activeTabKey.value, contentRef.value?.scrollTop ?? 0)
  activeTabKey.value = key
  await nextTick()
  syncTabIndicator()

  if (contentRef.value) {
    contentRef.value.scrollTop = tabScrollTopMap.get(key) ?? 0
  }
}

function onTabKeydown(event, currentKey) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return
  }

  event.preventDefault()
  const keyList = settingTabList.value.map(tab => tab.key)
  const currentIndex = keyList.indexOf(currentKey)
  const step = event.key === 'ArrowDown' ? 1 : -1
  const nextKey = keyList[(currentIndex + step + keyList.length) % keyList.length]
  activateTab(nextKey)
  tabButtonMap.get(nextKey)?.focus()
}

function refreshSystemFontList() {
  if (document.visibilityState === 'visible') {
    window.queryLocalFonts().then((fonts) => {
      const list = []
      const familySet = new Set(fonts.map(font => font.family))
      familySet.forEach((family) => {
        const label = fonts.filter(font => font.family === family).sort((a, b) => a.fullName.length - b.fullName.length)[0].fullName
        list.push({
          value: family,
          label: family === label ? family : `${family} (${label})`,
        })
      })
      systemFontList.value = list
    }).catch(() => {})
  }
}

function systemFontSelectFilterOption(inputValue, option) {
  return option.label.toLowerCase().includes(inputValue.toLowerCase())
}

function submitSetPathMutation(path, value) {
  return settingConfigMutationController.submitSetPath(path, value)
}

function normalizeOptionalStringValue(value) {
  return value === undefined ? '' : value
}

async function onNormalizedStringFieldChange(path, value) {
  const normalizedValue = normalizeOptionalStringValue(value)
  await submitSetPathMutation(path, normalizedValue)
}

async function onAutoSaveUpdate(nextAutoSave) {
  if (!config.value) {
    return
  }

  const previousAutoSave = Array.isArray(config.value.autoSave) ? [...config.value.autoSave] : []
  const normalizedNextAutoSave = Array.isArray(nextAutoSave) ? [...nextAutoSave] : []
  await settingConfigMutationController.submitAutoSaveListChange(previousAutoSave, normalizedNextAutoSave)
}

// 是否显示图片绝对路径
const showImgAbsolutePath = computed(() => {
  return config.value.imgLocal === '2' || config.value.imgNetwork === '2'
})

// 是否显示图片相对路径
const showImgRelativePath = computed(() => {
  return config.value.imgLocal === '4' || config.value.imgNetwork === '4'
})

onMounted(async () => {
  notifyFirstScreenReady()
  refreshSystemFontList()
  window.addEventListener('visibilitychange', refreshSystemFontList)
  window.addEventListener('resize', syncTabIndicator)

  await nextTick()
  syncTabIndicator()
  requestAnimationFrame(() => {
    tabIndicatorReady.value = true
  })

  // 字号变化会改变 tab 项高度，滑块需要跟着重算
  watch(() => config.value.fontSize, async () => {
    await nextTick()
    syncTabIndicator()
  })
})

onUnmounted(() => {
  window.removeEventListener('visibilitychange', refreshSystemFontList)
  window.removeEventListener('resize', syncTabIndicator)
})

watch(() => store.config.language, async () => {
  window.document.title = t('config.modalTitle')
  // tab 文案随语言变化，宽度与高度可能改变，滑块需要重算
  await nextTick()
  syncTabIndicator()
}, { immediate: true })

watch(() => store.config, (newValue) => {
  if (!newValue) {
    return
  }

  settingConfigMutationController.syncStoreConfig(newValue)
}, { deep: true })

const disallowedShortcutKeys = ['Backspace', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+ArrowUp', 'Shift+Alt+ArrowUp', 'Alt+ArrowDown', 'Shift+Alt+ArrowDown', 'Escape', 'Ctrl+Enter', 'Alt+l', 'Ctrl+i', 'Ctrl+[', 'Ctrl+]', 'Ctrl+Alt+\\', 'Shift+Ctrl+k', 'Shift+Ctrl+\\', 'Ctrl+/', 'Alt+A', 'Ctrl+m', 'ArrowLeft', 'Ctrl+ArrowLeft', 'ArrowRight', 'Ctrl+ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'Ctrl+Home', 'End', 'Ctrl+End', 'Enter', 'Ctrl+a', 'Backspace', 'Delete', 'Ctrl+Backspace', 'Ctrl+Delete', 'Ctrl+f', 'F3', 'Ctrl+g', 'Escape', 'Ctrl+Shift+l', 'Ctrl+Alt+g', 'Ctrl+d', 'Ctrl+z', 'Ctrl+y', 'Ctrl+u', 'Alt+u', 'Ctrl+Space', 'Escape', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Enter', 'Tab', 'Ctrl+c', 'Ctrl+v']
const functionShortcutKeyPattern = /^F(?:[1-9]|1[0-2])$/

function isProtectedShortcutKey(keymap) {
  return !functionShortcutKeyPattern.test(keymap) && disallowedShortcutKeys.includes(keymap)
}

/**
 * 监听修改快捷键
 */
function onKeydown(shortcutKey) {
  return async (e) => {
    if (shortcutKeyUtil.isShortcutKey(e)) {
      const keymap = shortcutKeyUtil.getShortcutKey(e)
      // 录制裸 F1-F12 时先拦截宿主默认行为，避免设置页被刷新或触发系统动作。
      if (functionShortcutKeyPattern.test(keymap)) {
        e.preventDefault()
      }
      const otherShortcutKeyList = config.value.shortcutKeyList.filter(item => item.id !== shortcutKey.id)
      for (let i = 0; i < otherShortcutKeyList.length; i++) {
        if (otherShortcutKeyList[i].keymap === keymap) {
          if (resolveLanguagePreference(config.value.language, navigator.language) === 'zh-CN') {
            const vNode = h('span', {}, [
              h('span', {}, '与 '),
              h('span', { style: { color: '#FAAD14', fontWeight: 'bold' } }, t(`shortcutKey.${otherShortcutKeyList[i].id}`)),
              h('span', {}, ' 快捷键冲突'),
            ])
            message.warn(vNode)
          } else {
            const vNode = h('span', {}, [
              h('span', {}, 'Shortcut key conflict with '),
              h('span', { style: { color: '#FAAD14', fontWeight: 'bold' } }, t(`shortcutKey.${otherShortcutKeyList[i].id}`)),
            ])
            message.warn(vNode)
          }

          return
        }
        if (isProtectedShortcutKey(keymap)) {
          message.warn(t('shortcutKey.conflictWithSystemShortcutKey'))
          return
        }
      }
      await settingConfigMutationController.submitShortcutKeyField(shortcutKey.id, 'keymap', keymap)
    }
  }
}

async function onShortcutKeyEnabledUpdate(shortcutKey, enabled) {
  await settingConfigMutationController.submitShortcutKeyField(shortcutKey.id, 'enabled', enabled)
}

/**
 * 快捷键聚焦
 */
function onShortcutKeyFocus(e, shortcutKey) {
  const handler = onKeydown(shortcutKey)
  window.addEventListener('keydown', handler)
  e.target.addEventListener('blur', () => {
    window.removeEventListener('keydown', handler)
  }, { once: true })
}

/**
 * 选择图片绝对路径
 */
async function openDirSelect() {
  const nextSelectedPath = await channelUtil.send({ event: 'open-dir-select' })
  if (typeof nextSelectedPath === 'string') {
    await submitSetPathMutation(['imgAbsolutePath'], nextSelectedPath)
  }
}

// 选择文件绝对路径
async function openFileDirSelect() {
  const nextSelectedPath = await channelUtil.send({ event: 'open-dir-select' })
  if (typeof nextSelectedPath === 'string') {
    await submitSetPathMutation(['fileAbsolutePath'], nextSelectedPath)
  }
}

// 选择文件管理栏默认目录
async function openFileDefaultDirSelect() {
  const nextSelectedPath = await channelUtil.send({ event: 'open-dir-select' })
  if (typeof nextSelectedPath === 'string') {
    await submitSetPathMutation(['fileDefaultDirectory'], nextSelectedPath)
  }
}

/**
 * recentMax 输入框使用受控更新，避免把清空产生的 null 写进配置草稿。
 */
function onRecentMaxUpdate(nextValue) {
  if (!config.value) {
    return
  }

  const normalizedValue = normalizeRecentMaxInputValue(nextValue)
  return submitSetPathMutation(['recentMax'], normalizedValue)
}

function settingMinimize() {
  channelUtil.send({ event: 'setting-minimize' })
}
function settingClose() {
  channelUtil.send({ event: 'setting-close' })
}
function reset() {
  Modal.confirm({
    title: t('config.resetToDefault'),
    icon: createVNode(ExclamationCircleOutlined),
    content: t('config.resetToDefaultTip'),
    okText: t('okText'),
    cancelText: t('cancelText'),
    centered: true,
    onOk: async () => {
      await settingConfigMutationController.submitReset()
      return true
    },
  })
}
</script>

<template>
  <OtherLayout icon="i-tabler:settings" :name="$t('config.modalTitle')">
    <template #action>
      <a-tooltip placement="bottom" color="#1677ff">
        <template #title>
          <span>{{ $t('config.resetToDefault') }}</span>
        </template>
        <TopBarActionButton icon="i-tabler:settings-off" @click="reset" />
      </a-tooltip>
      <TopBarActionButton icon="i-tabler:minus" @click="settingMinimize" />
      <TopBarActionButton icon="i-tabler:x" danger @click="settingClose" />
    </template>
    <div v-if="config" ref="settingContainerRef" class="allow-search setting-root h-full w-full flex">
      <nav class="wj-scrollbar setting-tabs shrink-0" role="tablist" aria-orientation="vertical">
        <div class="setting-tabs__inner" :class="{ 'is-ready': tabIndicatorReady }">
          <div class="setting-tabs__indicator" :style="tabIndicatorStyle" aria-hidden="true" />
          <button
            v-for="tab in settingTabList"
            :key="tab.key"
            :ref="element => setTabButtonRef(tab.key, element)"
            type="button"
            role="tab"
            class="setting-tab"
            :class="{ 'is-active': activeTabKey === tab.key }"
            :aria-selected="activeTabKey === tab.key"
            @click="activateTab(tab.key)"
            @keydown="onTabKeydown($event, tab.key)"
          >
            <span class="setting-tab__icon" :class="tab.icon" />
            <span class="setting-tab__label">{{ tab.label }}</span>
          </button>
        </div>
      </nav>

      <div ref="contentRef" class="wj-scrollbar setting-content min-w-0 flex-1 overflow-auto">
        <section v-show="activeTabKey === 'general'" data-panel-key="general" class="setting-panel">
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="general">{{ $t('config.title.general') }}</span>
            </template>
            <a-descriptions-item :label="$t('config.general.language')">
              <a-select
                :value="config.language"
                class="w-full"
                @update:value="value => submitSetPathMutation(['language'], value)"
              >
                <a-select-option value="auto">
                  {{ $t('config.general.languageAuto') }}
                </a-select-option>
                <a-select-option value="zh-CN">
                  中文
                </a-select-option>
                <a-select-option value="en-US">
                  English
                </a-select-option>
              </a-select>
            </a-descriptions-item>
            <a-descriptions-item>
              <template #label>
                <div class="flex items-center gap-1">
                  <span>{{ $t('config.general.startupView') }}</span>
                </div>
              </template>
              <a-radio-group :value="config.startView" button-style="solid" @update:value="value => submitSetPathMutation(['startView'], value)">
                <a-radio-button value="source">
                  {{ $t('config.general.startupViewOption.source') }}
                </a-radio-button>
                <a-radio-button value="split">
                  {{ $t('config.general.startupViewOption.split') }}
                </a-radio-button>
                <a-radio-button value="preview">
                  {{ $t('config.general.startupViewOption.preview') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.general.openLastRecord')">
              <a-radio-group :value="config.openRecent" button-style="solid" @update:value="value => submitSetPathMutation(['openRecent'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.general.recentHistoryCount')">
              <a-input-number
                :value="config.recentMax"
                :min="0"
                :max="50"
                :precision="0"
                :step="1"
                class="w-full"
                :controls="false"
                @update:value="onRecentMaxUpdate"
              />
            </a-descriptions-item>
            <a-descriptions-item>
              <template #label>
                <div class="flex items-center gap-1">
                  <span>{{ $t('config.general.autoSave') }}</span>
                  <a-tooltip placement="top" color="#1677ff" class="flex-shrink-0">
                    <template #title>
                      {{ $t('config.general.autoSaveOption.tip') }}
                    </template>
                    <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                  </a-tooltip>
                </div>
              </template>
              <a-checkbox-group :value="config.autoSave" :options="autoSaveOptionList" @update:value="onAutoSaveUpdate" />
            </a-descriptions-item>
            <a-descriptions-item>
              <template #label>
                <div class="flex items-center gap-1">
                  <span>{{ $t('config.general.externalFileChangeStrategy') }}</span>
                  <a-tooltip placement="top" color="#1677ff" class="flex-shrink-0">
                    <template #title>
                      {{ $t('config.general.externalFileChangeStrategyTip') }}
                    </template>
                    <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                  </a-tooltip>
                </div>
              </template>
              <a-radio-group :value="config.externalFileChangeStrategy" button-style="solid" @update:value="value => submitSetPathMutation(['externalFileChangeStrategy'], value)">
                <a-radio-button v-for="item in externalFileChangeStrategyOptionList" :key="item.value" :value="item.value">
                  {{ item.label }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
          </a-descriptions>
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="fileManager">{{ $t('config.title.fileManager') }}</span>
            </template>
            <a-descriptions-item :label="$t('config.fileManager.defaultView')">
              <a-radio-group :value="config.sidebarDefaultView" button-style="solid" @update:value="value => submitSetPathMutation(['sidebarDefaultView'], value)">
                <a-radio-button value="close">
                  {{ $t('config.fileManager.defaultViewOption.close') }}
                </a-radio-button>
                <a-radio-button value="files">
                  {{ $t('config.fileManager.defaultViewOption.files') }}
                </a-radio-button>
                <a-radio-button value="outline">
                  {{ $t('config.fileManager.defaultViewOption.outline') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.fileManager.defaultDirectory')">
              <a-input
                :value="config.fileDefaultDirectory"
                readonly
              >
                <template #addonAfter>
                  <div class="flex items-center gap-2">
                    <div
                      v-if="config.fileDefaultDirectory"
                      class="i-tabler:x cursor-pointer"
                      style="color: var(--wj-markdown-text-primary)"
                      @click="onNormalizedStringFieldChange(['fileDefaultDirectory'], undefined)"
                    />
                    <div
                      v-if="config.fileDefaultDirectory"
                      class="h-4 w-px"
                      style="background-color: var(--wj-markdown-text-tertiary)"
                    />
                    <div class="i-tabler:folder cursor-pointer" style="color: var(--wj-markdown-text-primary)" @click="openFileDefaultDirSelect" />
                  </div>
                </template>
              </a-input>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.fileManager.markdownLeftClickAction')">
              <a-radio-group
                :value="config.fileManagerLeftClickAction.markdown"
                button-style="solid"
                @update:value="value => submitSetPathMutation(['fileManagerLeftClickAction', 'markdown'], value)"
              >
                <a-radio-button value="prompt">
                  {{ $t('config.fileManager.leftClickActionOption.prompt') }}
                </a-radio-button>
                <a-radio-button value="new-window">
                  {{ $t('config.fileManager.leftClickActionOption.newWindow') }}
                </a-radio-button>
                <a-radio-button value="current-window">
                  {{ $t('config.fileManager.leftClickActionOption.currentWindow') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
          </a-descriptions>
        </section>

        <section v-show="activeTabKey === 'appearance'" data-panel-key="appearance" class="setting-panel">
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="view">{{ $t('config.title.view') }}</span>
            </template>
            <a-descriptions-item :label="$t('config.view.editorPreviewPosition')">
              <a-radio-group :value="config.editor.previewPosition" button-style="solid" @update:value="value => submitSetPathMutation(['editor', 'previewPosition'], value)">
                <a-radio-button value="left">
                  {{ $t('config.view.editorPreviewPositionOption.left') }}
                </a-radio-button>
                <a-radio-button value="right">
                  {{ $t('config.view.editorPreviewPositionOption.right') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.view.globalTheme')">
              <a-radio-group :value="config.theme.global" button-style="solid" @update:value="value => submitSetPathMutation(['theme', 'global'], value)">
                <a-radio-button value="light">
                  {{ $t('config.view.globalThemeOption.light') }}
                </a-radio-button>
                <a-radio-button value="dark">
                  {{ $t('config.view.globalThemeOption.dark') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.view.codeTheme')">
              <a-select
                :value="config.theme.code"
                class="w-full"
                @update:value="value => submitSetPathMutation(['theme', 'code'], value)"
              >
                <a-select-option v-for="item in codeThemeList" :key="item" :value="item">
                  {{ item }}
                </a-select-option>
              </a-select>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.view.previewTheme')">
              <a-select
                :value="config.theme.preview"
                class="w-full"
                @update:value="value => submitSetPathMutation(['theme', 'preview'], value)"
              >
                <a-select-option v-for="item in previewThemeList" :key="item" :value="item">
                  {{ item }}
                </a-select-option>
              </a-select>
            </a-descriptions-item>
            <a-descriptions-item>
              <template #label>
                <div class="flex items-center gap-1">
                  <span>{{ $t('config.view.previewImageShadow') }}</span>
                  <a-tooltip placement="top" color="#1677ff" class="flex-shrink-0">
                    <template #title>
                      {{ $t('config.view.previewImageShadowTip') }}
                    </template>
                    <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                  </a-tooltip>
                </div>
              </template>
              <a-radio-group :value="config.markdown.imageShadow" button-style="solid" @update:value="value => submitSetPathMutation(['markdown', 'imageShadow'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.view.previewWidth')">
              <a-slider
                :value="config.previewWidth"
                :min="20"
                :max="100"
                @update:value="value => submitSetPathMutation(['previewWidth'], value)"
              />
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.view.fontSize')">
              <a-slider
                :value="config.fontSize"
                :min="14"
                :max="28"
                @update:value="value => submitSetPathMutation(['fontSize'], value)"
              />
            </a-descriptions-item>
          </a-descriptions>
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <div id="font" class="flex items-center gap-1">
                <span>{{ $t('config.title.fontFamily') }}</span>
                <a-tooltip placement="top" color="#1677ff" class="flex-shrink-0">
                  <template #title>
                    {{ $t('config.fontFamily.tip') }}
                  </template>
                  <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                </a-tooltip>
              </div>
            </template>
            <a-descriptions-item :label="$t('config.fontFamily.editArea')">
              <a-select v-model:value="config.fontFamily.editArea" :options="systemFontList" class="w-full" :filter-option="systemFontSelectFilterOption" allow-clear show-search @change="value => onNormalizedStringFieldChange(['fontFamily', 'editArea'], value)" />
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.fontFamily.previewArea')">
              <a-select v-model:value="config.fontFamily.previewArea" :options="systemFontList" class="w-full" :filter-option="systemFontSelectFilterOption" allow-clear show-search @change="value => onNormalizedStringFieldChange(['fontFamily', 'previewArea'], value)" />
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.fontFamily.codeArea')">
              <a-select v-model:value="config.fontFamily.codeArea" :options="systemFontList" class="w-full" :filter-option="systemFontSelectFilterOption" allow-clear show-search @change="value => onNormalizedStringFieldChange(['fontFamily', 'codeArea'], value)" />
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.fontFamily.otherArea')">
              <a-select v-model:value="config.fontFamily.otherArea" :options="systemFontList" class="w-full" :filter-option="systemFontSelectFilterOption" show-search allow-clear @change="value => onNormalizedStringFieldChange(['fontFamily', 'otherArea'], value)" />
            </a-descriptions-item>
          </a-descriptions>
        </section>

        <section v-show="activeTabKey === 'editor'" data-panel-key="editor" class="setting-panel">
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="editor">{{ $t('config.title.editor') }}</span>
            </template>
            <a-descriptions-item :label="$t('config.editor.lineNumber')">
              <a-radio-group :value="config.editorExtension.lineNumbers" button-style="solid" @update:value="value => submitSetPathMutation(['editorExtension', 'lineNumbers'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.editor.lineWrapping')">
              <a-radio-group :value="config.editorExtension.lineWrapping" button-style="solid" @update:value="value => submitSetPathMutation(['editorExtension', 'lineWrapping'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.editor.highlightActiveLine')">
              <a-radio-group :value="config.editorExtension.highlightActiveLine" button-style="solid" @update:value="value => submitSetPathMutation(['editorExtension', 'highlightActiveLine'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.editor.associationHighlight')">
              <a-radio-group :value="config.editor.associationHighlight" button-style="solid" @update:value="value => submitSetPathMutation(['editor', 'associationHighlight'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.editor.inlineCodeClickCopy')">
              <a-radio-group :value="config.markdown.inlineCodeClickCopy" button-style="solid" @update:value="value => submitSetPathMutation(['markdown', 'inlineCodeClickCopy'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.editor.inlineCodeClickCopyOption.copy') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.saveOption.noOperation') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item>
              <template #label>
                <div class="flex items-center gap-1">
                  <span>{{ $t('config.editor.highlightMatchingText') }}</span>
                  <a-tooltip placement="top" color="#1677ff" class="flex-shrink-0">
                    <template #title>
                      {{ $t('config.editor.highlightMatchingTextOption.tip') }}
                    </template>
                    <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                  </a-tooltip>
                </div>
              </template>
              <a-radio-group :value="config.editorExtension.highlightSelectionMatches" button-style="solid" @update:value="value => submitSetPathMutation(['editorExtension', 'highlightSelectionMatches'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.editor.highlightMatchingBracket')">
              <a-radio-group :value="config.editorExtension.bracketMatching" button-style="solid" @update:value="value => submitSetPathMutation(['editorExtension', 'bracketMatching'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.editor.autoCloseBracket')">
              <a-radio-group :value="config.editorExtension.closeBrackets" button-style="solid" @update:value="value => submitSetPathMutation(['editorExtension', 'closeBrackets'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item>
              <template #label>
                <div class="flex items-center gap-1">
                  <span>{{ $t('config.editor.typographer') }}</span>
                  <a-popover trigger="hover" placement="topRight" color="#1677ff">
                    <template #title>
                      <span class="color-white">{{ $t('config.editor.typographerOption.tipTitle') }}</span>
                    </template>
                    <template #content>
                      <TypographerDescription />
                    </template>
                    <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                  </a-popover>
                </div>
              </template>
              <a-radio-group :value="config.markdown.typographer" button-style="solid" @update:value="value => submitSetPathMutation(['markdown', 'typographer'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
          </a-descriptions>
        </section>

        <section v-show="activeTabKey === 'shortcut'" data-panel-key="shortcut" class="setting-panel">
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="shortcut">{{ $t('config.title.globalShortcut') }}</span>
            </template>
            <a-descriptions-item v-for="item in globalShortcutKeyList" :key="item.id" :label="$t(`shortcutKey.${item.id}`)">
              <a-input
                :value="item.keymap"
                readonly
                class="select-none"
                @focus="onShortcutKeyFocus($event, item)"
              >
                <template #addonAfter>
                  <a-checkbox :checked="item.enabled" @update:checked="checked => onShortcutKeyEnabledUpdate(item, checked)" />
                </template>
              </a-input>
            </a-descriptions-item>
          </a-descriptions>
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span>{{ $t('config.title.editorShortcut') }}</span>
            </template>
            <a-descriptions-item v-for="item in editorShortcutKeyList" :key="item.id" :label="$t(`shortcutKey.${item.id}`)">
              <a-input
                :value="item.keymap"
                readonly
                class="select-none"
                @focus="onShortcutKeyFocus($event, item)"
              >
                <template #addonAfter>
                  <a-checkbox :checked="item.enabled" @update:checked="checked => onShortcutKeyEnabledUpdate(item, checked)" />
                </template>
              </a-input>
            </a-descriptions-item>
          </a-descriptions>
        </section>

        <section v-show="activeTabKey === 'fileAndImage'" data-panel-key="fileAndImage" class="setting-panel">
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="file">{{ $t('config.title.file') }}</span>
            </template>
            <a-descriptions-item :label="$t('config.file.file')">
              <a-select
                :value="config.fileMode"
                class="w-full"
                @update:value="value => submitSetPathMutation(['fileMode'], value)"
              >
                <a-select-option value="2">
                  {{ $t('config.saveOption.saveToAbsolutePath') }}
                </a-select-option>
                <a-select-option value="3">
                  {{ $t('config.saveOption.saveToFilenameFolder') }}
                </a-select-option>
                <a-select-option value="4">
                  {{ $t('config.saveOption.saveTorelativePath') }}
                </a-select-option>
              </a-select>
            </a-descriptions-item>
            <a-descriptions-item v-if="config.fileMode === '2'" :label="$t('config.file.absolutePath')">
              <a-input
                v-model:value="config.fileAbsolutePath"
                readonly
              >
                <template #addonAfter>
                  <div class="i-tabler:folder cursor-pointer" style="color: var(--wj-markdown-text-primary)" @click="openFileDirSelect" />
                </template>
              </a-input>
            </a-descriptions-item>
            <a-descriptions-item v-if="config.fileMode === '4'" :label="$t('config.file.relativePath')">
              <a-input :value="config.fileRelativePath" @update:value="value => submitSetPathMutation(['fileRelativePath'], value)" />
            </a-descriptions-item>
          </a-descriptions>
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="image">{{ $t('config.title.picture') }}</span>
            </template>
            <a-descriptions-item :label="$t('config.picture.localPicture')">
              <a-select
                :value="config.imgLocal"
                class="w-full"
                @update:value="value => submitSetPathMutation(['imgLocal'], value)"
              >
                <a-select-option value="2">
                  {{ $t('config.saveOption.saveToAbsolutePath') }}
                </a-select-option>
                <a-select-option value="3">
                  {{ $t('config.saveOption.saveToFilenameFolder') }}
                </a-select-option>
                <a-select-option value="4">
                  {{ $t('config.saveOption.saveTorelativePath') }}
                </a-select-option>
                <a-select-option value="5">
                  {{ $t('config.saveOption.uploadToPictureBed') }}
                </a-select-option>
              </a-select>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.picture.networkPicture')">
              <a-select
                :value="config.imgNetwork"
                class="w-full"
                @update:value="value => submitSetPathMutation(['imgNetwork'], value)"
              >
                <a-select-option value="1">
                  {{ $t('config.saveOption.noOperation') }}
                </a-select-option>
                <a-select-option value="2">
                  {{ $t('config.saveOption.saveToAbsolutePath') }}
                </a-select-option>
                <a-select-option value="3">
                  {{ $t('config.saveOption.saveToFilenameFolder') }}
                </a-select-option>
                <a-select-option value="4">
                  {{ $t('config.saveOption.saveTorelativePath') }}
                </a-select-option>
                <a-select-option value="5">
                  {{ $t('config.saveOption.uploadToPictureBed') }}
                </a-select-option>
              </a-select>
            </a-descriptions-item>
            <a-descriptions-item v-if="showImgAbsolutePath" :label="$t('config.picture.absolutePath')">
              <a-input
                v-model:value="config.imgAbsolutePath"
                readonly
              >
                <template #addonAfter>
                  <div class="i-tabler:folder cursor-pointer" style="color: var(--wj-markdown-text-primary)" @click="openDirSelect" />
                </template>
              </a-input>
            </a-descriptions-item>
            <a-descriptions-item v-if="showImgRelativePath" :label="$t('config.picture.relativePath')">
              <a-input :value="config.imgRelativePath" @update:value="value => submitSetPathMutation(['imgRelativePath'], value)" />
            </a-descriptions-item>
          </a-descriptions>
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="imageBed">{{ $t('config.title.pictureBed') }}</span>
            </template>
            <a-descriptions-item :label="$t('config.pictureBed.pictureBed')">
              <a-select
                :value="config.imageBed.uploader"
                class="w-full"
                @update:value="value => submitSetPathMutation(['imageBed', 'uploader'], value)"
              >
                <a-select-option v-for="item in imageBedUploaderList" :key="item.value" :value="item.value">
                  {{ item.name }}
                </a-select-option>
              </a-select>
            </a-descriptions-item>

            <!-- smms -->
            <a-descriptions-item v-if="config.imageBed.uploader === 'smms'" label="Token">
              <a-input-password :value="config.imageBed.smms.token" @update:value="value => submitSetPathMutation(['imageBed', 'smms', 'token'], value)" />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.imageBed.uploader === 'smms'" :label="$t('config.pictureBed.customDomain')">
              <a-input :value="config.imageBed.smms.backupDomain" @update:value="value => submitSetPathMutation(['imageBed', 'smms', 'backupDomain'], value)" />
            </a-descriptions-item>

            <!-- github -->
            <a-descriptions-item v-if="config.imageBed.uploader === 'github'" :label="$t('config.pictureBed.repository')">
              <a-input :value="config.imageBed.github.repo" placeholder="owner/repo" @update:value="value => submitSetPathMutation(['imageBed', 'github', 'repo'], value)" />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.imageBed.uploader === 'github'" label="Token">
              <a-input-password :value="config.imageBed.github.token" @update:value="value => submitSetPathMutation(['imageBed', 'github', 'token'], value)" />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.imageBed.uploader === 'github'" :label="$t('config.pictureBed.storagePath')">
              <a-input :value="config.imageBed.github.path" @update:value="value => submitSetPathMutation(['imageBed', 'github', 'path'], value)" />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.imageBed.uploader === 'github'" :label="$t('config.pictureBed.branch')">
              <a-input :value="config.imageBed.github.branch" placeholder="main" @update:value="value => submitSetPathMutation(['imageBed', 'github', 'branch'], value)" />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.imageBed.uploader === 'github'" :label="$t('config.pictureBed.customDomain')">
              <a-input :value="config.imageBed.github.customUrl" @update:value="value => submitSetPathMutation(['imageBed', 'github', 'customUrl'], value)" />
            </a-descriptions-item>
          </a-descriptions>
        </section>

        <section v-show="activeTabKey === 'exportAndWatermark'" data-panel-key="exportAndWatermark" class="setting-panel">
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="export">{{ $t('config.title.export') }}</span>
            </template>
            <a-descriptions-item :label="$t('config.export.pdfPageNumber')">
              <a-radio-group :value="config.export.pdf.footer.pageNumber" button-style="solid" @update:value="value => submitSetPathMutation(['export', 'pdf', 'footer', 'pageNumber'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.yes') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.no') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.export.pdfFooter')">
              <a-textarea
                :value="config.export.pdf.footer.content"
                spellcheck="false"
                placeholder="Support HTML tags"
                auto-size
                @update:value="value => submitSetPathMutation(['export', 'pdf', 'footer', 'content'], value)"
              />
            </a-descriptions-item>
            <a-descriptions-item :label="$t('config.export.pdfHeader')">
              <a-textarea
                :value="config.export.pdf.header.content"
                spellcheck="false"
                placeholder="Support HTML tags"
                auto-size
                @update:value="value => submitSetPathMutation(['export', 'pdf', 'header', 'content'], value)"
              />
            </a-descriptions-item>
          </a-descriptions>
          <a-descriptions bordered :column="1" size="small" class="setting-descriptions">
            <template #title>
              <span id="watermark">{{ $t('config.title.watermark') }}</span>
            </template>
            <a-descriptions-item :label="$t('config.watermark.watermark')">
              <a-radio-group :value="config.watermark.enabled" button-style="solid" @update:value="value => submitSetPathMutation(['watermark', 'enabled'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.enable') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.disable') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.previewWatermark')">
              <a-radio-group :value="config.watermark.previewEnabled" button-style="solid" @update:value="value => submitSetPathMutation(['watermark', 'previewEnabled'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.enable') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.disable') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.watermarkTime')">
              <a-radio-group :value="config.watermark.dateEnabled" button-style="solid" @update:value="value => submitSetPathMutation(['watermark', 'dateEnabled'], value)">
                <a-radio-button :value="true">
                  {{ $t('config.enable') }}
                </a-radio-button>
                <a-radio-button :value="false">
                  {{ $t('config.disable') }}
                </a-radio-button>
              </a-radio-group>
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.timeFormat')">
              <a-select :value="config.watermark.datePattern" class="w-full" @update:value="value => submitSetPathMutation(['watermark', 'datePattern'], value)">
                <a-select-option value="YYYY-MM-DD">
                  YYYY-MM-DD
                </a-select-option>
                <a-select-option value="YYYY-MM-DD HH:mm:ss">
                  YYYY-MM-DD HH:mm:ss
                </a-select-option>
              </a-select>
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.content')">
              <a-input :value="config.watermark.content" @update:value="value => submitSetPathMutation(['watermark', 'content'], value)" />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.angle')">
              <a-slider
                :value="config.watermark.rotate"
                :min="-180"
                :max="180"
                @update:value="value => submitSetPathMutation(['watermark', 'rotate'], value)"
              />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.intervalWidth')">
              <a-slider
                :value="config.watermark.gap[0]"
                :min="10"
                :max="500"
                @update:value="value => submitSetPathMutation(['watermark', 'gap', 0], value)"
              />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.intervalHeight')">
              <a-slider
                :value="config.watermark.gap[1]"
                :min="10"
                :max="500"
                @update:value="value => submitSetPathMutation(['watermark', 'gap', 1], value)"
              />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.fontSize')">
              <a-slider
                :value="config.watermark.font.fontSize"
                :min="12"
                :max="100"
                @update:value="value => submitSetPathMutation(['watermark', 'font', 'fontSize'], value)"
              />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.fontWeight')">
              <a-slider
                :value="config.watermark.font.fontWeight"
                :min="200"
                :max="1000"
                @update:value="value => submitSetPathMutation(['watermark', 'font', 'fontWeight'], value)"
              />
            </a-descriptions-item>
            <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.fontColor')">
              <ColorPicker :pure-color="config.watermark.font.color" format="rgb" shape="square" picker-type="chrome" @update:pure-color="value => submitSetPathMutation(['watermark', 'font', 'color'], value)" />
            </a-descriptions-item>
          </a-descriptions>
        </section>
      </div>
    </div>
  </OtherLayout>
</template>

<style scoped lang="scss">
.setting-root {
  border-top: 1px solid var(--wj-markdown-border-primary);
}

.setting-tabs {
  width: 180px;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: 1px solid var(--wj-markdown-border-primary);
  background: var(--wj-markdown-bg-primary);
  user-select: none;
}

.setting-tabs__inner {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
}

.setting-tabs__indicator {
  position: absolute;
  top: 0;
  right: 10px;
  left: 10px;
  z-index: 0;
  border-radius: 8px;
  background: var(--wj-markdown-bg-hover);
  pointer-events: none;
  will-change: transform, height;
}

.setting-tabs__inner.is-ready .setting-tabs__indicator {
  transition:
    transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
    height 220ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 200ms ease;
}

.setting-tab {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  color: var(--wj-markdown-text-secondary);
  text-align: left;
  cursor: pointer;
  transition:
    background 160ms ease,
    color 160ms ease;
}

.setting-tab:hover {
  background: var(--wj-markdown-bg-secondary);
  color: var(--wj-markdown-text-primary);
}

.setting-tab.is-active {
  background: transparent;
  color: var(--wj-markdown-text-primary);
  font-weight: 600;
}

.setting-tab.is-active:hover {
  background: transparent;
}

.setting-tab:focus-visible {
  outline: 2px solid var(--wj-markdown-sash-hover);
  outline-offset: -2px;
}

.setting-tab__icon {
  font-size: 17px;
}

.setting-tab__label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.setting-content {
  padding: 18px 22px 32px;
}

.setting-panel {
  animation: setting-panel-in 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes setting-panel-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.setting-descriptions {
  margin-bottom: 14px;
}

.setting-descriptions:last-child {
  margin-bottom: 0;
}

:deep(.ant-descriptions-item-label) {
  width: 160px;
  user-select: none;
}

:deep(.ant-radio-button-wrapper) {
  min-width: 120px;
  text-align: center;
}

:deep(.ant-descriptions-title) {
  padding-top: 0;
  padding-bottom: 0px;
  user-select: none;
}

:deep(.ant-descriptions-title) span {
  display: inline-block;
}

:deep(.ant-descriptions .ant-descriptions-header) {
  margin-bottom: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .setting-tabs__inner.is-ready .setting-tabs__indicator {
    transition: none;
  }

  .setting-panel {
    animation: none;
  }
}
</style>
