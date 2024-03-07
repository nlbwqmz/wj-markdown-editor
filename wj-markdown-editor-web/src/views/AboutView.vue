<template>
  <wj-modal :action="[{key: 'close', click: nodeRequestUtil.closeAboutWin}]">
    <template #icon>
      <InfoCircleOutlined />
    </template>
    <template #title>
      <span>关于</span>
    </template>
    <a-descriptions bordered :column="1" size="small">
      <a-descriptions-item label="程序名">{{name}}</a-descriptions-item>
      <a-descriptions-item label="当前版本">
        <span>{{version}}</span>
        <a-button type="link" :loading="checking" @click="checkUpdate" v-if="!downloading">检查更新</a-button>
      </a-descriptions-item>
      <a-descriptions-item label="最新版本">
        <span :style="checkInfo && checkInfo.success === false ? { color: 'red' } : {}">{{newVersion}}</span>
        <a-button type="link" @click="executeDownload" v-if="!downloading && checkInfo && checkInfo.version && checkInfo.version !== version && !downloadFinish">立即下载</a-button>
        <a-button type="link" @click="cancelDownload" v-if="downloading && !downloadFinish" danger>取消下载</a-button>
        <a-popconfirm
          v-if="downloadFinish"
          title="请先保存文件，安装后程序将重启，确认继续？"
          ok-text="确认"
          cancel-text="取消"
          @confirm="executeUpdate"
        >
          <a-button type="link">立即安装</a-button>
        </a-popconfirm>
      </a-descriptions-item>
      <a-descriptions-item label="下载进度">
        <a-progress :percent="percent" v-if="downloading || downloadFinish"/>
        <span v-else>-</span>
      </a-descriptions-item>
    </a-descriptions>
  </wj-modal>
</template>

<script setup>
import 'md-editor-v3/lib/preview.css'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import { InfoCircleOutlined } from '@ant-design/icons-vue'
import WjModal from '@/components/WjModal.vue'
import { ref, computed } from 'vue'
import nodeRegisterUtil from '@/util/nodeRegisterUtil'
import { useRoute } from 'vue-router'
const route = useRoute()

// 参数在hash路由 # 之前，不能用route获取
const searchParams = new URL(window.location.href).searchParams
const version = searchParams && searchParams.get('version') ? searchParams.get('version') : route.query.version
const name = searchParams && searchParams.get('name') ? searchParams.get('name') : route.query.name
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

nodeRegisterUtil.messageToAbout(result => {
  checkInfo.value = result
  checking.value = false
  downloading.value = false
  downloadFinish.value = false
})
nodeRegisterUtil.updaterDownloadProgress(progress => {
  percent.value = parseFloat(String(Math.floor(progress.percent * 10) / 10))
})

nodeRegisterUtil.downloadFinish(() => {
  percent.value = 100
  downloading.value = false
  downloadFinish.value = true
})
const checkUpdate = () => {
  checking.value = true
  downloading.value = false
  percent.value = 0
  checkInfo.value = undefined
  downloadFinish.value = false
  nodeRequestUtil.checkUpdate()
}
//
const executeDownload = () => {
  percent.value = 0
  downloading.value = true
  nodeRequestUtil.executeDownload()
}

const cancelDownload = () => {
  downloading.value = false
  downloadFinish.value = false
  percent.value = 0
  nodeRequestUtil.cancelDownload()
}

const executeUpdate = () => {
  nodeRequestUtil.executeUpdate()
}

</script>

<style lang="less" scoped>
:deep(.ant-progress-line) {
  margin-inline-end: 0;
  margin-bottom: 0;
}
:deep(.ant-btn) {
  height: revert;
  padding: 0 15px;
}
:deep(.ant-descriptions-item-label){
  width: 90px;
}
</style>
