<script setup>
import log from '@/assets/img/logo.png'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import { computed, onBeforeMount, ref } from 'vue'

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
function openFolder() {
  channelUtil.send({ event: 'open-folder' })
}

function openAbout() {
  channelUtil.send({ event: 'open-about' })
}

const fileName = computed(() => useCommonStore().fileName)
const saved = computed(() => useCommonStore().saved)
const isMaximize = computed(() => useCommonStore().isMaximize)
const isAlwaysOnTop = computed(() => useCommonStore().isAlwaysOnTop)

function alwaysOnTop(flag) {
  channelUtil.send({ event: 'always-on-top', data: flag })
}

const appInfo = ref({ name: 'wj-markdown-editor', version: '' })

const hasNewVersion = computed(() => useCommonStore().hasNewVersion)

onBeforeMount(async () => {
  const info = await channelUtil.send({ event: 'app-info' })
  appInfo.value.name = info.name
  appInfo.value.version = `v${info.version}`
})
</script>

<template>
  <div class="w-full flex items-center overflow-hidden">
    <div class="electron-drag flex items-center gap-1 p-2">
      <img :src="log" alt="logo" class="h-4 w-4">
      <div class="flex items-center justify-center font-size-3.5">
        <span>{{ appInfo.name }}</span>
      </div>
      <div class="flex items-center justify-center font-size-3.5">
        <span>{{ appInfo.version }}</span>
      </div>
    </div>
    <div class="electron-drag h-full flex flex-1 items-center justify-center overflow-hidden font-bold line-height-normal">
      <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ fileName }}</span>
      <span v-if="!saved" class="color-red">*</span>
    </div>
    <div class="flex items-center">
      <a-tooltip v-if="hasNewVersion" placement="bottom" color="#1677ff">
        <template #title>
          <span>新版本</span>
        </template>
        <div class="bouncing h-8 w-8 flex items-center justify-center color-red hover:cursor-pointer hover:bg-bg-hover" @click="openAbout">
          <div class="i-tabler:arrow-bar-up" />
        </div>
      </a-tooltip>
      <a-tooltip placement="bottom" color="#1677ff">
        <template #title>
          <span>打开文件位置</span>
        </template>
        <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="openFolder">
          <div class="i-tabler:folder-open" />
        </div>
      </a-tooltip>
      <a-tooltip v-if="!isAlwaysOnTop" placement="bottom" color="#1677ff">
        <template #title>
          <span>置顶</span>
        </template>
        <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="alwaysOnTop(true)">
          <div class="i-tabler:pin" />
        </div>
      </a-tooltip>
      <a-tooltip v-if="isAlwaysOnTop" placement="bottom" color="#1677ff">
        <template #title>
          <span>取消置顶</span>
        </template>
        <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="alwaysOnTop(false)">
          <div class="i-tabler:pinned-off" />
        </div>
      </a-tooltip>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="minimize">
        <div class="i-tabler:minus" />
      </div>
      <div v-show="!isMaximize" class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="maximize">
        <div class="i-tabler:crop-1-1" />
      </div>
      <div v-show="isMaximize" class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="restore">
        <div class="i-tabler:layers-subtract" />
      </div>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-red" @click="close">
        <div class="i-tabler:x" />
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
