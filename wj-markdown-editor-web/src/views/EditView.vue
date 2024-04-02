<template>
  <div style="height: 100%">
    <md-editor v-model="content" ref="editorRef" style="width: 100%; height: 100%"
               :editorId="editorId"
               @onSave="onSave"
               @onChange="onChange"
               @compositionstart="onCompositionStart"
               @compositionend="onCompositionEnd"
               @on-upload-img="onUploadImg"
               no-img-zoom-in
               :toolbarsExclude="['pageFullscreen', 'fullscreen', 'htmlPreview', 'github', 'image']"
               :md-heading-id="commonUtil.mdHeadingId"
               :preview-theme="config.previewTheme"
               :code-theme="config.codeTheme"
    ></md-editor>
  </div>

  <a-modal v-model:open="networkImgModal" title="网络图片" ok-text="确认" cancel-text="取消" @ok="handleNetworkImgModalOk" centered :maskClosable="false" :ok-button-props="{ disabled: networkImgModalOkDisabled }">
    <a-input v-model:value="imgUrl" placeholder="网络图片地址" :status="imgUrlInputStatus" allow-clear/>
  </a-modal>

  <a-dropdown placement="left">
    <a-float-button type="default" class="float-button" style="right: 50px; bottom: 150px" description="图片" shape="square">
      <template #icon>
        <img :src="iconImg" alt="img" style="width: 20px;">
      </template>
    </a-float-button>
    <template #overlay>
      <a-menu>
        <a-menu-item>
          <div @click="insertImgTemplate">插入模板</div>
        </a-menu-item>
        <a-menu-item>
          <div @click="uploadLocalImg">本地图片</div>
        </a-menu-item>
        <a-menu-item>
          <div @click="() => { imgUrl = ''; networkImgModal = true }">网络图片</div>
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>

  <a-dropdown placement="left">
    <a-float-button type="default" class="float-button" style="right: 50px; bottom: 100px" description="截图" shape="square">
      <template #icon>
        <ScissorOutlined />
      </template>
    </a-float-button>
    <template #overlay>
      <a-menu>
        <a-menu-item>
          <div @click="() => { nodeRequestUtil.screenshot(id, false) }">直接截图</div>
        </a-menu-item>
        <a-menu-item>
          <div @click="() => { nodeRequestUtil.screenshot(id, true) }">隐藏截图</div>
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>

  <a-float-button type="default" class="float-button" @click="toPreview" style="right: 50px" description="预览" v-if="config.jumpRouterBtn" shape="square">
    <template #icon>
      <EyeOutlined />
    </template>
  </a-float-button>
</template>

<script setup>
import { EyeOutlined, ScissorOutlined } from '@ant-design/icons-vue'
import iconImg from '@/assets/icon/icon-img.png'
import { ref, onMounted, computed, nextTick, watch } from 'vue'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import store from '@/store'
import commonUtil from '@/util/commonUtil'
import { useRouter } from 'vue-router'
const router = useRouter()
const id = commonUtil.getUrlParam('id')
// import { message } from 'ant-design-vue'
// import { EditorView } from '@codemirror/view'
// import { openSearchPanel, SearchCursor } from '@codemirror/search'
const handleChange = ref(true)
const content = ref('')
const editorRef = ref()
const networkImgModal = ref(false)
const imgUrl = ref()
const imgUrlInputStatus = ref('')
const networkImgModalOkDisabled = ref(true)
const editorId = commonUtil.createId()

const checkImgUrl = (value, blankAble) => {
  if (value) {
    return /^http(s)?:\/\/[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'*+,;=]+$/.test(value)
  } else {
    return blankAble
  }
}
const insertImgTemplate = () => {
  editorRef.value?.insert(() => {
    return {
      targetValue: '![]()',
      select: true,
      deviationStart: 0,
      deviationEnd: 0
    }
  })
}

watch(imgUrl, (newValue, oldValue) => {
  if (checkImgUrl(newValue, false)) {
    imgUrlInputStatus.value = ''
    networkImgModalOkDisabled.value = false
  } else {
    networkImgModalOkDisabled.value = true
    imgUrlInputStatus.value = 'error'
  }
})
const handleNetworkImgModalOk = () => {
  if (checkImgUrl(imgUrl.value, false)) {
    networkImgModal.value = false
    onUploadImg([{ url: imgUrl.value }])
  }
}

const uploadLocalImg = () => {
  const fileInput = window.document.createElement('input')
  fileInput.setAttribute('type', 'file')
  fileInput.setAttribute('multiple', 'true')
  fileInput.setAttribute('accept', 'image/*')
  fileInput.style.display = 'none'
  fileInput.onchange = () => {
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      const list = []
      for (let i = 0; i < fileInput.files.length; i++) {
        fileInput.files.item(i).isSelect = true
        list.push(fileInput.files.item(i))
      }
      onUploadImg(list)
    }
    fileInput.remove()
  }
  fileInput.click()
}
const onSave = (v, h) => {
  nodeRequestUtil.saveFile({ id })
}
const onChange = content => {
  if (handleChange.value === true) {
    nodeRequestUtil.onContentChange(content, id)
  }
}
const onCompositionStart = () => {
  handleChange.value = false
}
const onCompositionEnd = () => {
  handleChange.value = true
  nodeRequestUtil.onContentChange(content.value, id)
}

const fileToBase64 = file => {
  return new Promise((resolve, reject) => {
    // 创建一个新的 FileReader 对象
    const reader = new FileReader()
    // 读取 File 对象
    reader.readAsDataURL(file)
    // 加载完成后
    reader.onload = function () {
      // 将读取的数据转换为 base64 编码的字符串
      const base64String = reader.result.split(',')[1]
      // 解析为 Promise 对象，并返回 base64 编码的字符串
      resolve(base64String)
    }
    // 加载失败时
    reader.onerror = function () {
      reject(new Error('Failed to load file'))
    }
  })
}

const onUploadImg = async (files) => {
  const list = await Promise.all(await files.map(async item => {
    if (item.path) { // 选择本地图片
      return { path: item.path, type: item.type, isSelect: item.isSelect }
    } else if (item.url) { // 通过URL插入网络图片
      return { url: item.url }
    } else { // 通过粘贴板 插入网络图片
      return { base64: await fileToBase64(item), type: item.type }
    }
  }))
  nodeRequestUtil.uploadImage({ id, fileList: list })
}

onMounted(async () => {
  store.commit('pushEditorRefList', { id, editorRef })
  content.value = await nodeRequestUtil.getFileContent(id)
  await nextTick(() => {
    editorRef.value?.resetHistory()
  })
})

const toPreview = () => {
  router.push({ path: '/preview', query: { id } })
}

const config = computed(() => store.state.config)

</script>

<style lang="less" scoped>
.md-editor {
  border-top: none !important;
}
</style>
