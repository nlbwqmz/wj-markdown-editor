<script setup>
import { message } from 'ant-design-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import log from '@/assets/img/logo.png'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import {
  createSetConfigPathRequest,
  sendConfigMutationRequest,
} from '@/util/config/configMutationCommandUtil.js'
import { getConfigUpdateFailureMessageKey } from '@/util/config/configUpdateResultUtil.js'
import { createLayoutTopOpenFolderAction } from './layoutTopOpenFolderAction.js'

const store = useCommonStore()
const { t } = useI18n()

// 顶部栏视图模式按钮组：源码 / 双栏 / 预览
const VIEW_MODE_ITEMS = [
  { mode: 'source', icon: 'i-tabler:code', labelKey: 'shortcutKey.viewSource', shortcutKeyId: 'viewSource' },
  { mode: 'split', icon: 'i-tabler:layout-columns', labelKey: 'shortcutKey.viewSplit', shortcutKeyId: 'viewSplit' },
  { mode: 'preview', icon: 'i-tabler:eye', labelKey: 'shortcutKey.viewPreview', shortcutKeyId: 'viewPreview' },
]

// 从配置中收集已启用且已配置的快捷键，供按钮 tooltip 展示
const shortcutKeyMap = computed(() => {
  const map = {}
  for (const item of store.config.shortcutKeyList ?? []) {
    if (item.enabled === true && item.keymap) {
      map[item.id] = item.keymap
    }
  }
  return map
})

// 侧边栏开关：与 LayoutMenu 中“打开/关闭侧边栏”菜单项共用同一 store 状态
const sidebarVisible = computed(() => store.sidebarVisible === true)
const sidebarToggleLabel = computed(() => t(sidebarVisible.value
  ? 'topMenu.view.children.closeSidebar'
  : 'topMenu.view.children.openSidebar'))

function toggleSidebar() {
  if (typeof store.setSidebarVisible === 'function') {
    store.setSidebarVisible(!sidebarVisible.value)
    return
  }
  store.sidebarVisible = !sidebarVisible.value
}

function selectViewMode(mode) {
  store.setViewMode(mode)
}

function minimize() {
  channelUtil.send({ event: 'minimize' })
}
function maximize() {
  channelUtil.send({ event: 'maximize' })
}
function restore() {
  channelUtil.send({ event: 'restore' })
}
function close() {
  channelUtil.send({ event: 'close' })
}
const openFolder = createLayoutTopOpenFolderAction({
  sendCommand: payload => channelUtil.send(payload),
  notifyDocumentNotSaved: () => {
    message.warning(t('message.theCurrentFileIsNotSaved'))
  },
})

function openAbout() {
  channelUtil.send({ event: 'open-about' })
}

const fileName = computed(() => store.fileName)
const saved = computed(() => store.saved)
const isMaximize = computed(() => store.isMaximize)
const isAlwaysOnTop = computed(() => store.isAlwaysOnTop)
const theme = computed(() => store.config.theme.global)

function alwaysOnTop(flag) {
  channelUtil.send({ event: 'always-on-top', data: flag })
}

async function switchThemes() {
  try {
    const result = await sendConfigMutationRequest(
      createSetConfigPathRequest(['theme', 'global'], theme.value === 'light' ? 'dark' : 'light'),
    )
    const messageKey = getConfigUpdateFailureMessageKey(result)
    if (messageKey) {
      message.warning(t(messageKey))
    }
  }
  catch {
    message.warning(t('message.configWriteFailed'))
  }
}

const language = computed(() => store.config.language)

async function switchLanguage(lang) {
  try {
    const result = await sendConfigMutationRequest(
      createSetConfigPathRequest(['language'], lang),
    )
    const messageKey = getConfigUpdateFailureMessageKey(result)
    if (messageKey) {
      message.warning(t(messageKey))
    }
  }
  catch {
    message.warning(t('message.configWriteFailed'))
  }
}

const hasNewVersion = computed(() => store.hasNewVersion)
</script>

<template>
  <div class="w-full flex items-center overflow-hidden py-0.5">
    <div class="electron-drag flex items-center pl-2 pr-2">
      <img :src="log" alt="logo" class="h-4 w-4">
    </div>
    <div
      data-testid="layout-top-brand-divider"
      class="h-4 w-px shrink-0"
      style="background-color: var(--wj-markdown-border-primary)"
    />
    <div class="electron-no-drag flex items-center">
      <a-tooltip placement="bottomRight" color="#1677ff">
        <template #title>
          <div v-if="shortcutKeyMap.toggleFileManagerPanel" class="flex gap-2">
            <div>{{ sidebarToggleLabel }}</div>
            <div class="color-[rgb(200,200,200)]">
              {{ shortcutKeyMap.toggleFileManagerPanel }}
            </div>
          </div>
          <span v-else>{{ sidebarToggleLabel }}</span>
        </template>
        <div
          data-testid="layout-top-toggle-sidebar"
          :data-active="String(sidebarVisible)"
          :aria-pressed="sidebarVisible"
          class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer"
          @click="toggleSidebar"
        >
          <div
            class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover"
          >
            <div :class="sidebarVisible ? 'i-tabler:layout-sidebar-left-collapse' : 'i-tabler:layout-sidebar-left-expand'" />
          </div>
        </div>
      </a-tooltip>
    </div>
    <div
      data-testid="layout-top-menu-divider"
      class="h-4 w-px shrink-0"
      style="background-color: var(--wj-markdown-border-primary)"
    />
    <div class="electron-no-drag flex shrink-0 items-center">
      <slot name="menu" />
    </div>
    <div class="electron-drag h-full flex flex-1 items-center justify-center overflow-hidden font-bold line-height-normal">
      <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ fileName }}</span>
      <span v-if="!saved" class="color-red">*</span>
    </div>
    <div class="flex items-center">
      <a-tooltip v-if="hasNewVersion" placement="bottom" color="#1677ff">
        <template #title>
          <span>{{ $t('top.newVersion') }}</span>
        </template>
        <div class="group bouncing h-8 w-8 flex items-center justify-center color-red hover:cursor-pointer" @click="openAbout">
          <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover">
            <div class="i-tabler:arrow-bar-up" />
          </div>
        </div>
      </a-tooltip>
      <div
        v-if="hasNewVersion"
        data-testid="layout-top-view-group-divider"
        class="h-4 w-px shrink-0"
        style="background-color: var(--wj-markdown-border-primary)"
      />
      <a-tooltip
        v-for="item in VIEW_MODE_ITEMS"
        :key="item.mode"
        placement="bottom"
        color="#1677ff"
      >
        <template #title>
          <div v-if="shortcutKeyMap[item.shortcutKeyId]" class="flex gap-2">
            <div>{{ $t(item.labelKey) }}</div>
            <div class="color-[rgb(200,200,200)]">
              {{ shortcutKeyMap[item.shortcutKeyId] }}
            </div>
          </div>
          <span v-else>{{ $t(item.labelKey) }}</span>
        </template>
        <div
          :data-testid="`layout-top-view-mode-${item.mode}`"
          :data-active="String(store.viewMode === item.mode)"
          :aria-pressed="store.viewMode === item.mode"
          class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer"
          @click="selectViewMode(item.mode)"
        >
          <div
            class="h-7 w-7 flex items-center justify-center rounded-1"
            :class="store.viewMode === item.mode ? 'bg-bg-hover' : 'group-hover:bg-bg-hover'"
          >
            <div :class="item.icon" />
          </div>
        </div>
      </a-tooltip>
      <div
        data-testid="layout-top-view-group-divider"
        class="h-4 w-px shrink-0"
        style="background-color: var(--wj-markdown-border-primary)"
      />
      <a-tooltip placement="bottom" color="#1677ff">
        <template #title>
          <span>{{ $t('top.switchTheme') }}</span>
        </template>
        <div class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer" @click="switchThemes">
          <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover">
            <div v-if="theme === 'light'" class="i-tabler:moon" />
            <div v-else class="i-tabler:sun" />
          </div>
        </div>
      </a-tooltip>
      <a-dropdown placement="bottom" :trigger="['hover', 'click']" arrow>
        <div class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer">
          <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover">
            <div class="i-tabler:language" />
          </div>
        </div>
        <template #overlay>
          <a-menu>
            <a-menu-item key="auto" @click="switchLanguage('auto')">
              <span v-if="language === 'auto'" class="i-tabler:check mr-1" />
              <span v-else class="mr-1 inline-block w-[1em]" />{{ $t('top.languageAuto') }}
            </a-menu-item>
            <a-menu-item key="zh-CN" @click="switchLanguage('zh-CN')">
              <span v-if="language === 'zh-CN'" class="i-tabler:check mr-1" />
              <span v-else class="mr-1 inline-block w-[1em]" />中文
            </a-menu-item>
            <a-menu-item key="en-US" @click="switchLanguage('en-US')">
              <span v-if="language === 'en-US'" class="i-tabler:check mr-1" />
              <span v-else class="mr-1 inline-block w-[1em]" />English
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
      <a-tooltip placement="bottom" color="#1677ff">
        <template #title>
          <span>{{ $t('top.openInExplorer') }}</span>
        </template>
        <div class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer" @click="openFolder">
          <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover">
            <div class="i-tabler:folder-open" />
          </div>
        </div>
      </a-tooltip>
      <a-tooltip v-if="!isAlwaysOnTop" placement="bottom" color="#1677ff">
        <template #title>
          <span>{{ $t('top.pinTop') }}</span>
        </template>
        <div class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer" @click="alwaysOnTop(true)">
          <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover">
            <div class="i-tabler:pin" />
          </div>
        </div>
      </a-tooltip>
      <a-tooltip v-if="isAlwaysOnTop" placement="bottom" color="#1677ff">
        <template #title>
          <span>{{ $t('top.cancelPinTop') }}</span>
        </template>
        <div class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer" @click="alwaysOnTop(false)">
          <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover">
            <div class="i-tabler:pinned-off" />
          </div>
        </div>
      </a-tooltip>
      <div class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer" @click="minimize">
        <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover">
          <div class="i-tabler:minus" />
        </div>
      </div>
      <div v-show="!isMaximize" class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer" @click="maximize">
        <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover">
          <div class="i-tabler:crop-1-1" />
        </div>
      </div>
      <div v-show="isMaximize" class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer" @click="restore">
        <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-bg-hover">
          <div class="i-tabler:layers-subtract" />
        </div>
      </div>
      <div class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer" @click="close">
        <div class="h-7 w-7 flex items-center justify-center rounded-1 group-hover:bg-red">
          <div class="i-tabler:x" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@keyframes update-bounce {
  0%,
  100% {
    transform: translateY(0); /* 起始和结束位置 */
  }
  50% {
    transform: translateY(-4px); /* 跳到最高点 */
  }
}
.bouncing {
  animation: update-bounce 1s ease-in-out infinite;
}
</style>
