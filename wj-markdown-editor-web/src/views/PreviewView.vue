<template>
  <div style="width: 100%; min-height: 100%; border-left: var(--wj-inner-border)" :id="previewId" class="preview-container">
    <div v-if="!content" :style="{ height: `calc(100vh - ${offsetTop + 1}px)` }" class="horizontal-vertical-center">
      <a-empty>
        <template #description>
          <p style="color: rgba(0, 0, 0, 0.25)">暂无文本</p>
          <a-button type="link" @click="toEdit">去编辑</a-button>
        </template>
      </a-empty>
    </div>
    <div style="width: 100%; display: flex; justify-content: center" v-if="content">
      <div :style="{ width: `${config.previewWidth}%` }" style="display: flex; justify-content: center">
        <div style="flex: 1; overflow: hidden">
          <md-preview
            :id="componentId"
            :model-value="content"
            :editor-id="domId"
            :md-heading-id="commonUtil.mdHeadingId"
            no-img-zoom-in
            :preview-theme="config.previewTheme"
            :code-theme="config.codeTheme"
            @on-html-changed="handleHtmlChanged()">
          </md-preview>
        </div>
        <div v-if="catalogShow" style="max-width: 300px; min-width: 200px;" :style="{ height: `calc(100vh - ${offsetTop + 1}px)` }">
          <a-affix :offset-top="offsetTop" :style="{ height: `calc(100vh - ${offsetTop + 1}px)` }">
            <div style="border-left: var(--wj-inner-border);overflow: auto" class="wj-scrollbar-hover" :style="{ height: `calc(100vh - ${offsetTop + 1}px)` }">
              <md-catalog :editor-id="domId" :scrollElement="scrollElement" :scroll-element-offset-top="offsetTop" :md-heading-id="commonUtil.mdHeadingId"/>
            </div>
          </a-affix>
        </div>
      </div>
    </div>
    <a-float-button type="default" @click="catalogShow = true" class="float-button" style="right: 50px; bottom: 100px " description="目录" shape="square" v-if="content && !catalogShow">
      <template #icon>
        <EyeOutlined />
      </template>
    </a-float-button>
    <a-float-button type="default" @click="catalogShow = false" class="float-button" style="right: 50px; bottom: 100px " description="目录" shape="square" v-if="content && catalogShow">
      <template #icon>
        <EyeInvisibleOutlined />
      </template>
    </a-float-button>
    <a-float-button type="default" @click="toEdit" class="float-button" style="right: 50px" description="编辑" v-if="config.jumpRouterBtn" shape="square">
      <template #icon>
        <EditOutlined />
      </template>
    </a-float-button>
  </div>
</template>

<script setup>
import { MdCatalog, MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { computed, onActivated, ref } from 'vue'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import store from '@/store'
import { EditOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import commonUtil from '@/util/commonUtil'
import 'viewerjs/dist/viewer.css'
import Viewer from 'viewerjs'

const router = useRouter()
const content = ref()
const scrollElement = document.getElementById('main')
const domId = commonUtil.createId()
const previewId = commonUtil.createId()
const componentId = commonUtil.createId()
const catalogShow = ref()
const offsetTop = 103
const imgViewer = ref()
const id = commonUtil.getUrlParam('id')

onActivated(async () => {
  const fileContent = await nodeRequestUtil.getFileContent(id)
  catalogShow.value = store.state.config.catalogShow
  if (fileContent.exists === true) {
    content.value = fileContent.content
  } else {
    router.push({ path: '/notFound', query: { id } }).then(() => {})
  }
})
const handleHtmlChanged = commonUtil.debounce(() => {
  if (imgViewer.value) {
    imgViewer.value.update()
  } else {
    imgViewer.value = new Viewer(document.getElementById(previewId), {
      title: false,
      toolbar: {
        zoomIn: true,
        zoomOut: true,
        oneToOne: true,
        reset: true,
        prev: true,
        next: true,
        rotateLeft: true,
        rotateRight: true,
        flipHorizontal: true,
        flipVertical: true
      },
      container: document.getElementById(previewId)
    })
  }
})
const config = computed(() => store.state.config)

const toEdit = () => {
  router.push({ path: '/edit', query: { id } })
}
</script>

<style scoped lang="less">

</style>
