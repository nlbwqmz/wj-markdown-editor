<script setup>
import { useCommonStore } from '@/stores/counter.js'
import md from '@/util/markdown-it/markdownItDefault.js'
import mermaid from 'mermaid'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

const store = useCommonStore()

/**
 * 根据全局主题获取 mermaid 主题
 * @param {string} globalTheme - 全局主题 'light' 或 'dark'
 * @returns {string} mermaid 主题
 */
function getMermaidTheme(globalTheme) {
  return globalTheme === 'dark' ? 'dark' : 'default'
}

/**
 * 初始化 mermaid 配置
 */
function initMermaid() {
  const theme = getMermaidTheme(store.config.theme.global)
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'loose',
  })
}

const previewRef = ref()

const imageSrcList = ref([])
const imagePreviewVisible = ref(false)
const imagePreviewCurrentIndex = ref(0)

/**
 * 统一处理预览区点击事件（事件委托）
 */
function handlePreviewClick(e) {
  // 处理图片点击
  const img = e.target.closest('img')
  if (img) {
    const index = Number(img.dataset.index)
    imagePreviewVisible.value = true
    imagePreviewCurrentIndex.value = index
    return
  }

  // 处理脚注链接点击
  const footnoteLink = e.target.closest('.footnote-ref a, .footnote-backref')
  if (footnoteLink) {
    const href = footnoteLink.getAttribute('href')
    if (!href || !href.startsWith('#'))
      return

    e.preventDefault()
    const targetId = href.slice(1)
    const targetElement = document.getElementById(targetId)
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

/**
 * 统一处理预览区右键事件（事件委托）
 */
function handlePreviewContextmenu(e) {
  const img = e.target.closest('img')
  if (img) {
    e.preventDefault()
    emits('imageContextmenu', img.src)
  }
}

/**
 * 绑定预览区事件
 */
function bindPreviewEvents() {
  previewRef.value?.addEventListener('click', handlePreviewClick)
  previewRef.value?.addEventListener('contextmenu', handlePreviewContextmenu)
}

/**
 * 解绑预览区事件
 */
function unbindPreviewEvents() {
  previewRef.value?.removeEventListener('click', handlePreviewClick)
  previewRef.value?.removeEventListener('contextmenu', handlePreviewContextmenu)
}

/**
 * 更新图片索引（用于预览）
 */
function updateImageIndex() {
  const imageDomList = previewRef.value.querySelectorAll('img')
  const srcList = []
  imageDomList.forEach((item, index) => {
    item.dataset.index = String(index)
    item.style.cursor = 'pointer'
    srcList.push(item.src)
  })
  imageSrcList.value = srcList
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

watch(() => store.config.markdown.typographer, (newValue) => {
  md.set({ typographer: newValue })
  refreshPreview(props.content)
})

watch(() => store.config.theme.global, () => {
  initMermaid()
  refreshPreview(props.content, true)
})

function refreshPreview(doc, forceRefreshMermaid = false) {
  let shouldRefreshMermaid = forceRefreshMermaid
  const rendered = md.render(doc)
  const tempElement = document.createElement('div')
  tempElement.innerHTML = rendered
  if (!forceRefreshMermaid) {
    tempElement.querySelectorAll('.mermaid').forEach((mermaidElement) => {
      // 强制刷新时跳过缓存复用
      const mermaidNode = previewRef.value.querySelector(`[data-code='${mermaidElement.dataset.code}']`)
      if (mermaidNode) {
        mermaidElement.classList.replace('mermaid', 'mermaid-cache')
        mermaidElement.innerHTML = mermaidNode.innerHTML
      } else {
        shouldRefreshMermaid = true
      }
    })
  }
  // 使用临时元素来更新，防止一些attribute没有映射到property上
  updateDOM(previewRef.value, tempElement)

  if (shouldRefreshMermaid) {
    mermaid.run()
  }
  updateImageIndex()
  pushAnchorList()
  emits('refreshComplete')
}

watch(() => props.content, (newValue) => {
  refreshPreview(newValue)
})

onMounted(() => {
  initMermaid()
  bindPreviewEvents()
  refreshPreview(props.content)
})

onBeforeUnmount(() => {
  unbindPreviewEvents()
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
    <div style="font-family: var(--preview-area-font);" class="backface-hidden pos-relative w-full p-2 before:table before:content-['']" :class="`code-theme-${codeTheme} preview-theme-${previewTheme}`">
      <div ref="previewRef" class="wj-scrollbar w-full" />
    </div>
  </a-watermark>
  <div class="hidden">
    <a-image-preview-group :preview="{ getContainer: getImagePreviewContainer, visible: imagePreviewVisible, onVisibleChange: (visible) => { imagePreviewVisible = visible }, current: imagePreviewCurrentIndex }">
      <a-image v-for="(item, index) in imageSrcList" :key="index" :src="item" />
    </a-image-preview-group>
  </div>
</template>
