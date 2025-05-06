<script setup>
import logo from '@/assets/img/logo.png'
import OtherLayout from '@/components/layout/OtherLayout.vue'
import channelUtil from '@/util/channel/channelUtil.js'
import eventEmit from '@/util/channel/eventEmit.js'
import { computed, onMounted, ref } from 'vue'

const appInfo = ref({})

onMounted(async () => {
  window.document.title = '关于'
  appInfo.value = await channelUtil.send({ event: 'get-app-info' })
})

function aboutMinimize() {
  channelUtil.send({ event: 'about-minimize' })
}
function aboutClose() {
  channelUtil.send({ event: 'about-close' })
}

const downloading = ref(false)
const percent = ref(0)
const checking = ref(false)
const checkInfo = ref()
const downloadFinish = ref(false)

const newVersion = computed(() => {
  if (checkInfo.value) {
    if (checkInfo.value.success === true) {
      return checkInfo.value.version
    } else {
      return checkInfo.value.message
    }
  } else {
    return '-'
  }
})

async function checkUpdate() {
  checking.value = true
  downloading.value = false
  percent.value = 0
  checkInfo.value = undefined
  downloadFinish.value = false
  checkInfo.value = await channelUtil.send({ event: 'check-update' })
  checking.value = false
}
//
function executeDownload() {
  percent.value = 0
  downloading.value = true
  channelUtil.send({ event: 'download-update' })
}

function cancelDownload() {
  downloading.value = false
  downloadFinish.value = false
  percent.value = 0
  channelUtil.send({ event: 'cancel-download-update' })
}

function executeUpdate() {
  channelUtil.send({ event: 'execute-update' })
}

onMounted(() => {
  checkUpdate()
  eventEmit.on('download-update-finish', () => {
    percent.value = 100
    downloading.value = false
    downloadFinish.value = true
  })
  eventEmit.on('update-error', (result) => {
    checkInfo.value = result
    checking.value = false
    downloading.value = false
    downloadFinish.value = false
  })
  eventEmit.on('download-update-progress', (progress) => {
    percent.value = Number.parseFloat(String(Math.floor(progress.percent * 10) / 10))
  })
})
</script>

<template>
  <OtherLayout icon="i-tabler:info-circle" name="关于">
    <template #action>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-[rgb(237,237,237)]" @click="aboutMinimize">
        <div class="i-tabler:minus" />
      </div>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-red" @click="aboutClose">
        <div class="i-tabler:x" />
      </div>
    </template>
    <div class="h-full w-full flex flex-col justify-between p-2">
      <div class="w-full text-center">
        <img :src="logo" alt="logo" class="w-30">
      </div>
      <a-alert
        type="warning"
        show-icon
      >
        <template #message>
          <span><span style="font-weight: bold">便携版</span>不支持自动升级，需手动下载，解压后直接替换根目录即可。</span>
        </template>
      </a-alert>
      <a-descriptions
        bordered
        :column="1"
        size="small"
      >
        <a-descriptions-item label="程序名">
          <span>{{ appInfo.name }}</span>
          <a-button
            type="link"
            href="https://github.com/nlbwqmz/wj-markdown-editor"
            target="_blank"
          >
            源码地址
          </a-button>
          <a-button
            type="link"
            href="https://github.com/nlbwqmz/wj-markdown-editor/releases"
            target="_blank"
          >
            下载地址
          </a-button>
          <a-button
            type="link"
            href="https://github.com/nlbwqmz/wj-markdown-editor/issues"
            danger
            target="_blank"
          >
            反馈
          </a-button>
        </a-descriptions-item>
        <a-descriptions-item label="当前版本">
          <span>{{ appInfo.version }}</span>
          <a-button
            v-if="!downloading"
            type="link"
            :loading="checking"
            @click="checkUpdate"
          >
            检查更新
          </a-button>
        </a-descriptions-item>
        <a-descriptions-item label="最新版本">
          <span :style="checkInfo && checkInfo.success === false ? { color: 'red' } : {}">{{ newVersion }}</span>
          <a-button
            v-if="checkInfo && checkInfo.version"
            type="link"
            :href="`https://github.com/nlbwqmz/wj-markdown-editor/releases/tag/${checkInfo.version}`"
            target="_blank"
          >
            更新日志
          </a-button>
          <a-button
            v-if="!downloading && checkInfo && checkInfo.version && checkInfo.version !== appInfo.version && !downloadFinish"
            type="link"
            @click="executeDownload"
          >
            立即下载
          </a-button>
          <a-button
            v-if="downloading && !downloadFinish"
            type="link"
            danger
            @click="cancelDownload"
          >
            取消下载
          </a-button>
          <a-popconfirm
            v-if="downloadFinish"
            title="当前操作不会校验文件是否保存，请确保文件已保存，安装后程序将重启，确认继续？"
            ok-text="确认"
            cancel-text="取消"
            @confirm="executeUpdate"
          >
            <a-button type="link">
              立即安装
            </a-button>
          </a-popconfirm>
        </a-descriptions-item>
        <a-descriptions-item label="下载进度">
          <a-progress
            v-if="downloading || downloadFinish"
            :percent="percent"
          />
          <span v-else>-</span>
        </a-descriptions-item>
      </a-descriptions>
    </div>
  </OtherLayout>
</template>

<style scoped lang="scss">
:deep(.ant-progress-line) {
  margin-inline-end: 0;
  margin-bottom: 0;
}
:deep(.ant-btn) {
  height: revert;
  padding: 0;
  margin-left: 10px;
}
:deep(.ant-descriptions-item-label) {
  width: 90px;
}
</style>
