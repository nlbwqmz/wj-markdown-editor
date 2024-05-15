<template>
  <wj-modal :action="[{key: 'close', click: nodeRequestUtil.closeSettingWin}, { key: 'minimize', click: nodeRequestUtil.settingWinMinimize}]">
    <template #icon>
      <SettingOutlined />
    </template>
    <template #title>
      <span>设置</span>
    </template>
    <div style="display: flex">
      <div style="flex: 1; overflow: auto">
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="general">常规</span>
          </template>
          <a-descriptions-item>
            <template #label>
              启动进入
              <a-tooltip title="仅当通过文件打开时生效" auto-adjust-overflow placement="right" color="#1677ff">
                <InfoCircleOutlined style="margin-left: 10px" class="tooltip-icon"/>
              </a-tooltip>
            </template>
            <a-radio-group v-model:value="config.initRoute" button-style="solid">
              <a-radio-button value="edit">编辑</a-radio-button>
              <a-radio-button value="preview">预览</a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item label="最小化到托盘">
            <a-radio-group v-model:value="config.minimizeToTray" button-style="solid">
              <a-radio-button :value="true">是</a-radio-button>
              <a-radio-button :value="false">否</a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item>
            <template #label>
              自动保存
              <a-tooltip title="仅当文件已保存过，且有未保存内容时触发" auto-adjust-overflow placement="right" color="#1677ff">
                <InfoCircleOutlined style="margin-left: 10px" class="tooltip-icon"/>
              </a-tooltip>
            </template>
            <a-select v-model:value="config.autoSave.minute" style="width: 100%">
              <a-select-option :value="0">关闭</a-select-option>
              <a-select-option :value="5">5分钟</a-select-option>
              <a-select-option :value="10">10分钟</a-select-option>
              <a-select-option :value="20">20分钟</a-select-option>
              <a-select-option :value="30">30分钟</a-select-option>
            </a-select>
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small" style="margin-top: 20px">
          <template #title>
            <span id="view">视图</span>
          </template>
          <a-descriptions-item label="跳转按钮">
            <a-radio-group v-model:value="config.jumpRouterBtn" button-style="solid">
              <a-radio-button :value="true">显示</a-radio-button>
              <a-radio-button :value="false">隐藏</a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item label="webdav">
            <a-radio-group v-model:value="config.showWebdav" button-style="solid">
              <a-radio-button :value="true">显示</a-radio-button>
              <a-radio-button :value="false">隐藏</a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item label="默认显示目录">
            <a-radio-group v-model:value="config.catalogShow" button-style="solid">
              <a-radio-button :value="true">是</a-radio-button>
              <a-radio-button :value="false">否</a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item label="预览宽度">
            <a-slider v-model:value="config.previewWidth" :min="10" :max="100" :tip-formatter="value => `${value}%`"/>
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small" style="margin-top: 20px">
          <template #title>
            <span id="topic">主题</span>
          </template>
          <a-descriptions-item label="代码主题">
            <a-select v-model:value="config.codeTheme" style="width: 100%">
              <a-select-option value="atom">atom</a-select-option>
              <a-select-option value="a11y">a11y</a-select-option>
              <a-select-option value="github">github</a-select-option>
              <a-select-option value="gradient">gradient</a-select-option>
              <a-select-option value="kimbie">kimbie</a-select-option>
              <a-select-option value="paraiso">paraiso</a-select-option>
              <a-select-option value="qtcreator">qtcreator</a-select-option>
              <a-select-option value="stackoverflow">stackoverflow</a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="预览主题">
            <a-select v-model:value="config.previewTheme" style="width: 100%">
              <a-select-option value="default">default</a-select-option>
              <a-select-option value="github">github</a-select-option>
              <a-select-option value="vuepress">vuepress</a-select-option>
              <a-select-option value="mk-cute">mk-cute</a-select-option>
              <a-select-option value="smart-blue">smart-blue</a-select-option>
              <a-select-option value="cyanosis">cyanosis</a-select-option>
            </a-select>
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small" style="margin-top: 20px">
          <template #title>
            <span id="image">图片</span>
            <a-tooltip title="上传需配置PicGo" auto-adjust-overflow placement="right" color="#1677ff">
              <InfoCircleOutlined style="margin-left: 10px" class="tooltip-icon"/>
            </a-tooltip>
          </template>
          <a-descriptions-item label="图片保存位置">
            <a-input v-model:value="config.imgSavePath" readonly>
              <template #addonAfter>
                <FolderOutlined style="cursor: pointer" @click="openDirSelect"/>
              </template>
            </a-input>
          </a-descriptions-item>
          <a-descriptions-item label="上传本地图片">
            <a-select v-model:value="config.insertLocalImgType" style="width: 100%">
              <a-select-option value="1">无操作</a-select-option>
              <a-select-option value="2">复制到 ./%{filename} 文件夹</a-select-option>
              <a-select-option value="3">复制到 ./assets 文件夹</a-select-option>
              <a-select-option value="4">复制到指定文件夹</a-select-option>
              <a-select-option value="5">上传</a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="粘贴本地图片">
            <a-select v-model:value="config.insertPasteboardLocalImgType" style="width: 100%">
              <a-select-option value="1">无操作</a-select-option>
              <a-select-option value="2">复制到 ./%{filename} 文件夹</a-select-option>
              <a-select-option value="3">复制到 ./assets 文件夹</a-select-option>
              <a-select-option value="4">复制到指定文件夹</a-select-option>
              <a-select-option value="5">上传</a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="上传网络图片">
            <a-select v-model:value="config.insertNetworkImgType" style="width: 100%">
              <a-select-option value="2">复制到 ./%{filename} 文件夹</a-select-option>
              <a-select-option value="3">复制到 ./assets 文件夹</a-select-option>
              <a-select-option value="4">复制到指定文件夹</a-select-option>
              <a-select-option value="5">上传</a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="粘贴网络图片">
            <a-select v-model:value="config.insertPasteboardNetworkImgType" style="width: 100%">
              <a-select-option value="2">复制到 ./%{filename} 文件夹</a-select-option>
              <a-select-option value="3">复制到 ./assets 文件夹</a-select-option>
              <a-select-option value="4">复制到指定文件夹</a-select-option>
              <a-select-option value="5">上传</a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="截图">
            <a-select v-model:value="config.insertScreenshotImgType" style="width: 100%">
              <a-select-option value="2">复制到 ./%{filename} 文件夹</a-select-option>
              <a-select-option value="3">复制到 ./assets 文件夹</a-select-option>
              <a-select-option value="4">复制到指定文件夹</a-select-option>
              <a-select-option value="5">上传</a-select-option>
            </a-select>
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small" style="margin-top: 20px">
          <template #title>
            <span id="watermark">水印</span>
          </template>
          <a-descriptions-item label="导出水印">
            <a-radio-group v-model:value="config.watermark.enabled" button-style="solid">
              <a-radio-button :value="true">开启</a-radio-button>
              <a-radio-button :value="false">关闭</a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item label="导出时间" v-if="config.watermark.enabled === true">
            <a-radio-group v-model:value="config.watermark.exportDate" button-style="solid">
              <a-radio-button :value="true">开启</a-radio-button>
              <a-radio-button :value="false">关闭</a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item label="导出时间格式" v-if="config.watermark.enabled === true && config.watermark.exportDate === true">
            <a-select v-model:value="config.watermark.exportDateFormat" style="width: 100%">
              <a-select-option value="YYYY-MM-DD">年-月-日</a-select-option>
              <a-select-option value="YYYY-MM-DD HH:mm:ss">年-月-日 时:分:秒</a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="内容" v-if="config.watermark.enabled === true">
            <a-input v-model:value="config.watermark.content" />
          </a-descriptions-item>
          <a-descriptions-item label="旋转角度" v-if="config.watermark.enabled === true">
            <a-slider v-model:value="config.watermark.rotate" :min="-180" :max="180"/>
          </a-descriptions-item>
          <a-descriptions-item label="间隔宽度" v-if="config.watermark.enabled === true">
            <a-slider v-model:value="config.watermark.gap[0]" :min="10" :max="500"/>
          </a-descriptions-item>
          <a-descriptions-item label="间隔高度" v-if="config.watermark.enabled === true">
            <a-slider v-model:value="config.watermark.gap[1]" :min="10" :max="500"/>
          </a-descriptions-item>
          <a-descriptions-item label="字体大小" v-if="config.watermark.enabled === true">
            <a-slider v-model:value="config.watermark.font.fontSize" :min="12" :max="100"/>
          </a-descriptions-item>
          <a-descriptions-item label="字体粗细" v-if="config.watermark.enabled === true">
            <a-slider v-model:value="config.watermark.font.fontWeight" :min="200" :max="1000"/>
          </a-descriptions-item>
          <a-descriptions-item label="字体颜色" v-if="config.watermark.enabled === true">
            <pick-colors v-model:value="config.watermark.font.color" show-alpha/>
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small" style="margin-top: 20px">
          <template #title>
            <span id="PicGo">PicGo<a-button type="link" href="https://picgo.github.io/PicGo-Doc/" target="_blank">官方网站</a-button></span>
          </template>
          <a-descriptions-item label="地址">
            <a-input v-model:value="config.picGo.host"/>
          </a-descriptions-item>
          <a-descriptions-item label="端口">
            <a-input-number v-model:value="config.picGo.port" :min="1" style="width: 100%"/>
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small" style="margin-top: 20px">
          <template #title>
            <span id="export">导出</span>
          </template>
          <a-descriptions-item>
            <template #label>
              <a-button type="link" href="https://pandoc.org/" target="_blank" style="padding-left: 0; padding-right: 0">Pandoc</a-button>
            </template>
            <div style="display: flex">
              <a-input v-model:value="config.pandocPath" readonly style="flex: 1">
                <template #addonAfter>
                  <FolderOutlined style="cursor: pointer" @click="openDirSelectPandocPath"/>
                </template>
              </a-input>
              <a-tooltip title="在pandoc目录生成模板文件wj-markdown-editor-reference.docx，用于自定义word样式。(若模板文件存在，不会重新生成。)" auto-adjust-overflow placement="top" color="#1677ff">
                <a-button type="link" v-if="config.pandocPath" @click="generateDocxTemplate" style="padding-right: 0; padding-left: 0; margin-left: 15px">生成模板文件</a-button>
              </a-tooltip>
            </div>
          </a-descriptions-item>
        </a-descriptions>
      </div>
      <div style="padding-left: 10px">
        <a-affix :offset-top="46">
          <a-anchor :items="anchorList" @click="handleAnchorClick" :get-container="getAnchorContainer" :affix="false" :offset-top="10"/>
        </a-affix>
      </div>
    </div>
  </wj-modal>
</template>

<script setup>
import { FolderOutlined, InfoCircleOutlined, SettingOutlined } from '@ant-design/icons-vue'
import PickColors from 'vue-pick-colors'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import store from '@/store'
import { ref, watch } from 'vue'
import commonUtil from '@/util/commonUtil'
import WjModal from '@/components/WjModal.vue'
const config = ref({})
const submit = ref(true)
const anchorList = [
  { key: '1', href: '#general', title: '常规' },
  { key: '2', href: '#view', title: '视图' },
  { key: '3', href: '#topic', title: '主题' },
  { key: '4', href: '#image', title: '图片' },
  { key: '5', href: '#watermark', title: '水印' },
  { key: '6', href: '#PicGo', title: 'PicGo' },
  { key: '7', href: '#export', title: '导出' }
]
const handleAnchorClick = (e, link) => {
  e.preventDefault()
}
const getAnchorContainer = () => {
  return window.document.getElementById('wj-modal-container')
}
watch(() => store.state.config, (newValue, oldValue) => {
  submit.value = false
  config.value = commonUtil.deepCopy(newValue)
}, { immediate: true, deep: true })
watch(() => config.value, (newValue, oldValue) => {
  if (submit.value) {
    nodeRequestUtil.updateConfig(commonUtil.deepCopy(newValue))
  } else {
    submit.value = true
  }
}, { immediate: true, deep: true })

const openDirSelect = async () => {
  const imgSavePath = await nodeRequestUtil.openDirSelect()
  if (imgSavePath) {
    config.value.imgSavePath = imgSavePath
  }
}
const openDirSelectPandocPath = async () => {
  const imgSavePath = await nodeRequestUtil.openDirSelect()
  if (imgSavePath) {
    config.value.pandocPath = imgSavePath
  }
}

const generateDocxTemplate = () => {
  nodeRequestUtil.generateDocxTemplate()
}
</script>

<style scoped lang="less">
.container {
  padding: 10px;
}

.top {
  display: flex;
  font-size: 20px;
  line-height: 20px;
  justify-content: space-between;

  .top-action {
    width: 60px;
    font-size: 20px;
    display: flex;
    justify-content: right;
    .top-action-item {
      margin-left: 10px;
      width: 20px;
      height: 20px;
      cursor: pointer;
    }
  }
}

.tooltip-icon {
  color: rgba(0, 0, 0, 0.25)
}
.tooltip-icon:hover {
  color: #1677ff;
}
:deep(.ant-descriptions-item-label){
  width: 120px;
}
:deep(.ant-anchor-wrapper) {
  padding-block-start: revert;
}
:deep(.ant-radio-button-wrapper) {
  min-width: 60px;
  text-align: center;
}
</style>
