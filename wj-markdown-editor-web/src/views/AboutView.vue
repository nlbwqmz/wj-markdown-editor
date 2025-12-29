<script setup>
import logo from '@/assets/img/logo.png'
import OtherLayout from '@/components/layout/OtherLayout.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import eventEmit from '@/util/channel/eventEmit.js'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import { createVNode, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const appInfo = ref({})

watch(() => useCommonStore().config.language, () => {
  window.document.title = t('aboutView.title')
}, { immediate: true })

onMounted(async () => {
  document.documentElement.style.fontSize = '16px'
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

async function checkUpdate() {
  checking.value = true
  downloading.value = false
  percent.value = 0
  checkInfo.value = undefined
  downloadFinish.value = false
  checkInfo.value = await channelUtil.send({ event: 'check-update' })
  checking.value = false
  if(checkInfo.value) {
    if(checkInfo.value.success === true) {
      if(checkInfo.value.version === appInfo.value.version) {
        Modal.success({
          title: t('prompt'),
          content: t('aboutView.alreadyLatestVersion'),
        });
      }
    } else {
      Modal.error({
        title: t('prompt'),
        content: t('aboutView.checkUpdateFailed'),
      });
    }
  } else {
    Modal.warning({
      title: t('prompt'),
      content: t('aboutView.tip'),
    });
  }
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
  Modal.confirm({
    title: t('prompt'),
    icon: createVNode(ExclamationCircleOutlined),
    content: t('aboutView.confirmExecuteUpdate'),
    okText: t('okText'),
    cancelText: t('cancelText'),
    onOk: () => {
      channelUtil.send({ event: 'execute-update' })
    },
  })
}

onMounted(() => {
  eventEmit.on('download-update-finish', () => {
    percent.value = 100
    downloading.value = false
    downloadFinish.value = true
  })
  eventEmit.on('update-error', (result) => {
    checking.value = false
    downloading.value = false
    downloadFinish.value = false
    Modal.error({
      title: t('prompt'),
      content: t('aboutView.checkUpdateFailed'),
    });
  })
  eventEmit.on('download-update-progress', (progress) => {
    percent.value = Number.parseFloat(String(Math.floor(progress.percent * 10) / 10))
  })
})
</script>

<template>
  <OtherLayout icon="i-tabler:info-circle" :name="$t('aboutView.title')">
    <template #action>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="aboutMinimize">
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
      <div class="flex items-center justify-center gap-2 font-bold">
        <span>{{ appInfo.name }}</span>
        <span>v{{ appInfo.version }}</span>
      </div>
      <a-alert type="warning" show-icon :message="$t('aboutView.tip')" />
      <div class="flex items-center justify-center gap-2">
        <a-button
          type="link"
          href="https://github.com/nlbwqmz/wj-markdown-editor"
          target="_blank"
        >
          GitHub
        </a-button>
        <a-divider type="vertical" />
        <a-button
          type="link"
          href="https://github.com/nlbwqmz/wj-markdown-editor/releases"
          target="_blank"
        >
          {{ $t('aboutView.downloadPath') }}
        </a-button>
        <a-divider type="vertical" />
        <a-button
          type="link"
          href="https://github.com/nlbwqmz/wj-markdown-editor/issues"
          target="_blank"
        >
          {{ $t('aboutView.issues') }}
        </a-button>
        <a-divider type="vertical" />
        <a-button
          type="link"
          href="https://github.com/nlbwqmz/wj-markdown-editor/releases"
          target="_blank"
        >
          {{ $t('aboutView.updateLog') }}
        </a-button>
        <a-divider type="vertical" />
        <a-button
          :disabled="downloading"
          type="link"
          :loading="checking"
          @click="checkUpdate"
        >
          {{ $t('aboutView.checkUpdate') }}
        </a-button>
      </div>
      <div class="flex items-center justify-center gap-2">
        <a-typography-text v-if="checkInfo && checkInfo.version && checkInfo.version !== appInfo.version" type="success">
          {{ $t('aboutView.latestVersion') }} : v{{ checkInfo.version }}
        </a-typography-text>
        <a-button
          v-if="!downloading && checkInfo && checkInfo.version && checkInfo.version !== appInfo.version && !downloadFinish"
          type="link"
          @click="executeDownload"
        >
          {{ $t('aboutView.download') }}
        </a-button>
        <a-button
          v-if="downloading && !downloadFinish"
          type="link"
          danger
          @click="cancelDownload"
        >
          {{ $t('aboutView.cancelDownload') }}
        </a-button>
        <a-button v-if="downloadFinish" type="link" @click="executeUpdate">
          {{ $t('aboutView.install') }}
        </a-button>
      </div>
      <div v-if="downloading || downloadFinish" class="w-full p-x-8">
        <a-progress :percent="percent" />
      </div>
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
}
:deep(.ant-descriptions-item-label) {
  width: 90px;
}
</style>
