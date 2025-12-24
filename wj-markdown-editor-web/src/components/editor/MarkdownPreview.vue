<script setup>
import md from '@/util/markdown-it/markdownItDefault.js'
import mermaid from 'mermaid'
import { onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const props = defineProps({
  content: {
    type: String,
    default: () => '',
  },
  codeTheme: {
    type: String,
    default: () => 'atom-one-dark',
  },
  previewTheme: {
    type: String,
    default: () => 'github-light',
  },
  watermark: {
    type: Object,
    default: () => null,
  },
})

const emits = defineEmits(['refreshComplete', 'anchorChange', 'imageContextmenu'])

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
  emits('imageContextmenu', src)
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
 * 解析大纲并推送
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

function updateDOM(oldNode, newNode) {
  // 节点类型不同直接替换
  if (oldNode.nodeType !== newNode.nodeType || oldNode.nodeName !== newNode.nodeName) {
    const clonedNewNode = newNode.cloneNode(true)
    oldNode.replaceWith(clonedNewNode)
    return
  }

  // 处理文本节点
  if (oldNode.nodeType === Node.TEXT_NODE || oldNode.nodeType === Node.COMMENT_NODE) {
    if (oldNode.textContent !== newNode.textContent) {
      oldNode.textContent = newNode.textContent
    }
    return
  }

  // 元素节点属性比对
  const oldAttributes = oldNode.attributes
  const newAttributes = newNode.attributes
  const newAttrMap = {}

  // 构建新属性字典
  for (const { name, value } of newAttributes) {
    newAttrMap[name] = value
  }

  // 删除旧属性
  for (const { name } of oldAttributes) {
    if (!(name in newAttrMap)) {
      oldNode.removeAttribute(name)
    }
  }

  // 设置/更新属性
  for (const { name, value } of newAttributes) {
    if (oldNode.getAttribute(name) !== value) {
      oldNode.setAttribute(name, value)
    }
  }

  // 处理子节点（优化部分）
  const oldChildren = Array.from(oldNode.childNodes)
  const newChildren = Array.from(newNode.childNodes)
  const commonLength = Math.min(oldChildren.length, newChildren.length)

  // 第一步：更新共同范围内的子节点
  for (let i = 0; i < commonLength; i++) {
    updateDOM(oldChildren[i], newChildren[i])
  }

  // 第二步：处理多余旧子节点（从后往前删除）
  if (oldChildren.length > newChildren.length) {
    for (let i = oldChildren.length - 1; i >= newChildren.length; i--) {
      // 动态获取当前子节点
      if (oldNode.childNodes[i]) {
        oldNode.removeChild(oldNode.childNodes[i])
      }
    }
  }

  // 第三步：添加新增子节点
  if (newChildren.length > oldChildren.length) {
    for (let i = oldChildren.length; i < newChildren.length; i++) {
      oldNode.appendChild(newChildren[i].cloneNode(true))
    }
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
      mermaidElement.innerHTML = mermaidNode.innerHTML
    } else {
      shouldRefreshMermaid = true
    }
  })
  // 使用临时元素来更新，防止一些attribute没有映射到property上
  updateDOM(previewRef.value, tempElement)

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
  const container = document.getElementById('layout-container') || document.getElementById('wj-other-layout-container')
  return container || document.body
}
onBeforeRouteLeave(() => {
  imagePreviewVisible.value = false
})
</script>

<template>
  <a-watermark v-bind="watermark && watermark.enabled ? watermark : {}">
    <!-- 使用伪元素防止首个子元素导致margin塌陷 -->
    <div class="backface-hidden pos-relative w-full p-2 before:table before:content-['']" :class="`code-theme-${codeTheme} preview-theme-${previewTheme}`">
      <div ref="previewRef" class="wj-scrollbar w-full" />
    </div>
  </a-watermark>
  <div class="hidden">
    <a-image-preview-group :preview="{ getContainer: getImagePreviewContainer, visible: imagePreviewVisible, onVisibleChange: (visible) => { imagePreviewVisible = visible }, current: imagePreviewCurrentIndex }">
      <a-image v-for="(item, index) in imageSrcList" :key="index" :src="item" />
    </a-image-preview-group>
  </div>
</template>
