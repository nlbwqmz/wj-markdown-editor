<script setup>
import { useCommonStore } from '@/stores/counter.js'
import sendUtil from '@/util/channel/sendUtil.js'
import md from '@/util/markdown-it/markdownItDefault.js'
import dayjs from 'dayjs'
import { innerHTML } from 'diffhtml'
import mermaid from 'mermaid'
import { onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const props = defineProps({
  content: {
    type: String,
    default: () => '',
  },
  isPreview: {
    type: Boolean,
    default: () => true,
  },
  codeTheme: {
    type: String,
    default: () => 'atom-one-dark',
  },
  previewTheme: {
    type: String,
    default: () => 'github-light',
  },
})

const emits = defineEmits(['refreshComplete', 'anchorChange'])

const config = ref()

watch(() => useCommonStore().config, (newValue) => {
  const temp = JSON.parse(JSON.stringify(newValue))
  temp.watermark.content = temp.watermark.content ? temp.watermark.content : 'wj-markdown-editor'
  if (temp.watermark.dateEnabled === true) {
    temp.watermark.content = [temp.watermark.content, dayjs(new Date()).format(temp.watermark.datePattern)]
  }
  config.value = temp
}, { deep: true, immediate: true })

const previewRef = ref()

const imageSrcList = ref([])
const imagePreviewVisible = ref(false)
const imagePreviewCurrentIndex = ref(0)

function onImageClick(e) {
  const index = Number(e.target.dataset.index)
  imagePreviewVisible.value = true
  imagePreviewCurrentIndex.value = index
}

function onImageContextmenu(e) {
  const src = e.target.src
  sendUtil.send({ event: 'open-folder', data: src })
}

/**
 * 添加图片点击事件
 */
function addImageListener() {
  const srcList = []
  const imageDomList = previewRef.value.querySelectorAll('img')
  if (imageDomList.length > 0) {
    for (let i = 0; i < imageDomList.length; i++) {
      const item = imageDomList.item(i)
      item.dataset.index = String(i)
      item.style.cursor = 'pointer'
      srcList.push(item.src)
      item.addEventListener('click', onImageClick)
      item.addEventListener('contextmenu', onImageContextmenu)
    }
  }
  imageSrcList.value = srcList
}

/**
 * 移除图片点击事件
 */
function removeImageListener() {
  const imageDomList = previewRef.value.querySelectorAll('img')
  if (imageDomList.length > 0) {
    for (let i = 0; i < imageDomList.length; i++) {
      const item = imageDomList.item(i)
      item.removeEventListener('click', onImageClick)
      item.removeEventListener('contextmenu', onImageContextmenu)
    }
  }
}

const latestAnchorList = ref([])

/**
 * 解析目录并推送
 */
function pushAnchorList() {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
  const tree = []
  const stack = [{ children: tree }] // 根节点栈

  headings.forEach((heading) => {
    const node = {
      key: heading.id,
      href: `#${heading.id}`,
      title: heading.textContent,
      level: Number.parseInt(heading.tagName[1]),
      children: [],
    }

    // 寻找合适的父节点
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }

    // 添加到父节点的children
    stack[stack.length - 1].children.push(node)

    // 压入栈作为潜在父节点
    stack.push(node)
  })
  const anchorListJsonString = JSON.stringify(tree)
  if (JSON.stringify(latestAnchorList.value) !== anchorListJsonString) {
    latestAnchorList.value = tree
    emits('anchorChange', JSON.parse(anchorListJsonString))
  }
}

function refreshPreview(doc) {
  removeImageListener()
  let shouldRefreshMermaid = false
  const rendered = md.render(doc)
  const tempElement = document.createElement('div')
  tempElement.innerHTML = rendered
  tempElement.querySelectorAll('.mermaid').forEach((mermaidElement) => {
    const mermaidNode = previewRef.value.querySelector(`[data-code='${mermaidElement.dataset.code}']`)
    if (mermaidNode) {
      mermaidElement.classList.replace('mermaid', 'mermaid-cache')
      mermaidElement.innerHTML = ''
      mermaidNode.childNodes.forEach((child) => {
        mermaidElement.appendChild(child)
      })
    } else {
      shouldRefreshMermaid = true
    }
  })
  // 使用临时元素来更新，防止一些attribute没有映射到property上
  innerHTML(previewRef.value, tempElement, { disableMutationObserver: false })
  // const checkboxList = previewRef.value.querySelectorAll('input[type=checkbox]')
  // for (const checkboxListElement of checkboxList) {
  //   if (checkboxListElement.getAttribute('checked') !== null) {
  //     checkboxListElement.checked = true
  //   }
  // }
  if (shouldRefreshMermaid) {
    mermaid.run()
  }
  addImageListener()
  pushAnchorList()
  emits('refreshComplete')
}

watch(() => props.content, (newValue) => {
  refreshPreview(newValue)
})

onMounted(() => {
  refreshPreview(props.content)
})

function getImagePreviewContainer() {
  const container = document.getElementById('layout-container')
  return container || document.body
}
onBeforeRouteLeave(() => {
  imagePreviewVisible.value = false
})
</script>

<template>
  <a-watermark v-bind="config && config.watermark && config.watermark.enabled && (!isPreview || (isPreview && config.watermark.previewEnabled)) ? config.watermark : {}">
    <div ref="previewRef" class="pos-relative w-full" :class="`code-theme-${codeTheme} preview-theme-${previewTheme}`" />
  </a-watermark>
  <div class="hidden">
    <a-image-preview-group :preview="{ getContainer: getImagePreviewContainer, visible: imagePreviewVisible, onVisibleChange: (visible) => { imagePreviewVisible = visible }, current: imagePreviewCurrentIndex }">
      <a-image v-for="(item, index) in imageSrcList" :key="index" :src="item" />
    </a-image-preview-group>
  </div>
</template>
