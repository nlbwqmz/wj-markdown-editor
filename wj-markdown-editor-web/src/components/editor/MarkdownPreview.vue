<script setup>
import { message } from 'ant-design-vue'
import mermaid from 'mermaid'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave } from 'vue-router'
import { shouldReplaceElementBeforeAttributeSync } from '@/components/editor/markdownPreviewDomPatchUtil.js'
import { useCommonStore } from '@/stores/counter.js'
import { syncCodeBlockActionVariables } from '@/util/codeBlockActionStyleUtil.js'
import { loadCodeTheme } from '@/util/codeThemeUtil.js'
import { handlePreviewHashAnchorClick } from '@/util/editor/previewAnchorLinkScrollUtil.js'
import { createPreviewResourceContext } from '@/util/editor/previewResourceContextUtil.js'
import md from '@/util/markdown-it/markdownItDefault.js'
import { copyTextWithFeedback, getPreviewInlineCodeCopyText, syncPreviewInlineCodeCopyMetadata } from '@/util/previewInlineCodeCopyUtil.js'
import { settleMermaidRender } from '@/util/previewMermaidRenderUtil.js'

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
    default: () => 'github',
  },
  watermark: {
    type: Object,
    default: () => null,
  },
  previewScrollContainer: {
    type: Function,
    default: () => null,
  },
})

const emits = defineEmits(['refreshComplete', 'anchorChange', 'previewContextmenu', 'assetOpen'])

const store = useCommonStore()
const { t } = useI18n()
const previewShellRef = ref()

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

const previewShellStyle = {
  'fontFamily': 'var(--preview-area-font)',
  // 在样式层完成新旧变量名桥接，避免把兼容逻辑扩散到 helper 内部。
  '--wj-code-block-action-color': 'var(--wj-code-block-action-fg-muted)',
  '--wj-code-block-action-focus-color': 'var(--wj-code-block-action-fg)',
  '--wj-code-block-action-border-color': 'var(--wj-code-block-action-border)',
  '--wj-code-block-action-focus-border-color': 'var(--wj-code-block-action-border)',
  '--wj-code-block-action-background': 'var(--wj-code-block-action-bg)',
  '--wj-code-block-action-focus-background': 'var(--wj-code-block-action-bg)',
}

const imageSrcList = ref([])
const imagePreviewVisible = ref(false)
const imagePreviewCurrentIndex = ref(0)
const pendingContent = ref(props.content)

const PREVIEW_THROTTLE_MS = 180
let previewRefreshRafId = null
let previewRefreshTimer = null
let lastPreviewRefreshAt = 0
let previewRefreshSequence = 0

function createRafTask(callback) {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback)
  }
  return setTimeout(callback, 16)
}

function cancelRafTask(id) {
  if (typeof cancelAnimationFrame === 'function' && typeof requestAnimationFrame === 'function') {
    cancelAnimationFrame(id)
    return
  }
  clearTimeout(id)
}

function clearPreviewRefreshScheduler() {
  if (previewRefreshRafId !== null) {
    cancelRafTask(previewRefreshRafId)
    previewRefreshRafId = null
  }
  if (previewRefreshTimer !== null) {
    clearTimeout(previewRefreshTimer)
    previewRefreshTimer = null
  }
}

/**
 * 将当前代码主题派生出的结构层变量同步到预览壳节点。
 */
function refreshCodeBlockActionVariables() {
  syncCodeBlockActionVariables(previewShellRef.value)
}

function getAssetInfoFromDom(assetDom, event) {
  const resourceUrl = assetDom.getAttribute('src') || assetDom.getAttribute('href') || ''
  const rawSrc = assetDom.dataset.wjResourceSrc
  const rawPath = assetDom.dataset.wjResourceRaw || rawSrc
  const kind = assetDom.dataset.wjResourceKind
  if (!resourceUrl || !rawSrc || !kind) {
    return null
  }
  const lineDom = assetDom.closest('[data-line-start]')
  const occurrence = Number.parseInt(assetDom.dataset.wjResourceOccurrence || '1', 10)
  return {
    kind,
    rawSrc,
    rawPath,
    resourceUrl,
    occurrence: Number.isNaN(occurrence) ? 1 : occurrence,
    lineStart: lineDom?.dataset.lineStart ? Number.parseInt(lineDom.dataset.lineStart, 10) : undefined,
    lineEnd: lineDom?.dataset.lineEnd ? Number.parseInt(lineDom.dataset.lineEnd, 10) : undefined,
    clientX: event?.clientX,
    clientY: event?.clientY,
  }
}

/**
 * 统一处理预览区点击事件（事件委托）
 */
function handlePreviewClick(e) {
  if (!(e.target instanceof Element)) {
    return
  }

  // 处理图片点击
  const img = e.target.closest('img')
  if (img) {
    const index = Number(img.dataset.index)
    imagePreviewVisible.value = true
    imagePreviewCurrentIndex.value = index
    return
  }

  const assetLink = e.target.closest('a[data-wj-resource-src][data-wj-resource-kind="link"]')
  if (assetLink instanceof Element) {
    const assetInfo = getAssetInfoFromDom(assetLink, e)
    if (assetInfo?.resourceUrl) {
      e.preventDefault()
      emits('assetOpen', assetInfo)
      return
    }
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
    return
  }

  const inlineCodeText = getPreviewInlineCodeCopyText({
    enabled: store.config.markdown.inlineCodeClickCopy,
    target: e.target,
    selection: window.getSelection?.() || null,
  })
  if (inlineCodeText !== null) {
    copyTextWithFeedback({
      text: inlineCodeText,
      writeText: async text => await navigator.clipboard.writeText(text),
      onEmpty() {
        message.warning(t('message.noCopyableContent'))
      },
      onSuccess() {
        message.success(t('message.copySucceeded'))
      },
      onError() {
        message.error(t('message.copyFailed'))
      },
    }).then(() => {})
    return
  }

  if (handlePreviewHashAnchorClick({
    event: e,
    previewRoot: previewRef.value,
    previewScrollContainer: props.previewScrollContainer,
    // 统一在组件层处理提示，便于复用国际化文案与现有消息样式配置。
    onTargetMissing: () => {
      message.warning(t('message.anchorTargetDoesNotExist'))
    },
  })) {
    return void 0
  }
}

/**
 * 统一处理预览区右键事件（事件委托）
 */
function handlePreviewContextmenu(e) {
  if (!(e.target instanceof Element)) {
    return
  }
  const assetDom = e.target.closest('img[data-wj-resource-src], video[data-wj-resource-src], audio[data-wj-resource-src], a[data-wj-resource-src]')
  if (!(assetDom instanceof Element)) {
    return
  }
  const assetInfo = getAssetInfoFromDom(assetDom, e)
  if (!assetInfo) {
    return
  }
  const context = createPreviewResourceContext(assetInfo)
  if (!context) {
    return
  }
  e.preventDefault()
  emits('previewContextmenu', context)
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
 * 更新预览区资源元数据
 */
function updatePreviewAssetMetadata() {
  const imageDomList = previewRef.value.querySelectorAll('img')
  const srcList = []
  imageDomList.forEach((item, index) => {
    item.dataset.index = String(index)
    item.style.cursor = 'pointer'
    srcList.push(item.src)
  })
  imageSrcList.value = srcList

  const assetOccurrenceMap = new Map()
  const assetDomList = previewRef.value.querySelectorAll('img[data-wj-resource-src], video[data-wj-resource-src], audio[data-wj-resource-src], a[data-wj-resource-src]')
  assetDomList.forEach((item) => {
    const rawSrc = item.dataset.wjResourceSrc
    const kind = item.dataset.wjResourceKind
    if (!rawSrc || !kind) {
      return
    }
    const mapKey = `${kind}:${rawSrc}`
    const occurrence = (assetOccurrenceMap.get(mapKey) || 0) + 1
    assetOccurrenceMap.set(mapKey, occurrence)
    item.dataset.wjResourceOccurrence = String(occurrence)
  })
}

/**
 * 同步预览区行内代码复制交互 metadata。
 */
function updatePreviewInlineCodeCopyMetadata() {
  syncPreviewInlineCodeCopyMetadata({
    enabled: store.config.markdown.inlineCodeClickCopy,
    previewRoot: previewRef.value,
  })
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

  if (shouldReplaceElementBeforeAttributeSync(oldNode, newNode)) {
    const clonedNewNode = newNode.cloneNode(true)
    oldNode.replaceWith(clonedNewNode)
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
      try {
        oldNode.setAttribute(name, value)
      } catch {
        // 某些原生元素在属性更新过程中会立刻触发浏览器内建校验，
        // 一旦出现真实异常，直接整节点替换能避免保留半更新状态。
        const clonedNewNode = newNode.cloneNode(true)
        oldNode.replaceWith(clonedNewNode)
        return
      }
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
  refreshPreviewImmediately(props.content)
})

watch(() => store.config.theme.global, () => {
  initMermaid()
  refreshPreviewImmediately(props.content, true)
})

watch(() => store.config.markdown.inlineCodeClickCopy, () => {
  updatePreviewInlineCodeCopyMetadata()
})

// 监听 codeTheme 变化，动态加载主题 CSS
watch(() => props.codeTheme, async (newTheme) => {
  if (newTheme) {
    await loadCodeTheme(newTheme)
    refreshCodeBlockActionVariables()
  }
}, { immediate: true })

async function refreshPreview(doc, forceRefreshMermaid = false) {
  const currentRefreshSequence = ++previewRefreshSequence
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

  await settleMermaidRender({
    nodes: shouldRefreshMermaid ? previewRef.value.querySelectorAll('.mermaid') : [],
    runMermaid: options => mermaid.run(options),
    logError: (message, error) => {
      console.error(message, error)
    },
  })
  if (currentRefreshSequence !== previewRefreshSequence) {
    return
  }
  refreshCodeBlockActionVariables()
  updatePreviewAssetMetadata()
  updatePreviewInlineCodeCopyMetadata()
  pushAnchorList()
  emits('refreshComplete')
}

function refreshPreviewImmediately(doc, forceRefreshMermaid = false) {
  clearPreviewRefreshScheduler()
  pendingContent.value = doc
  refreshPreview(doc, forceRefreshMermaid).then(() => {})
  lastPreviewRefreshAt = Date.now()
}

function flushScheduledPreviewRefresh() {
  previewRefreshRafId = null
  const remainingMs = PREVIEW_THROTTLE_MS - (Date.now() - lastPreviewRefreshAt)

  if (remainingMs <= 0) {
    refreshPreview(pendingContent.value).then(() => {})
    lastPreviewRefreshAt = Date.now()
    return
  }

  if (previewRefreshTimer !== null) {
    clearTimeout(previewRefreshTimer)
  }
  previewRefreshTimer = setTimeout(() => {
    previewRefreshTimer = null
    refreshPreview(pendingContent.value).then(() => {})
    lastPreviewRefreshAt = Date.now()
  }, remainingMs)
}

function schedulePreviewRefresh(doc) {
  pendingContent.value = doc

  if (previewRefreshRafId !== null || previewRefreshTimer !== null) {
    return
  }
  previewRefreshRafId = createRafTask(() => {
    flushScheduledPreviewRefresh()
  })
}

watch(() => props.content, (newValue) => {
  schedulePreviewRefresh(newValue)
})

watch(() => store.externalFileChange.visible, (visible) => {
  if (visible) {
    imagePreviewVisible.value = false
  }
})

onMounted(() => {
  initMermaid()
  bindPreviewEvents()
  refreshPreviewImmediately(props.content)
})

onBeforeUnmount(() => {
  clearPreviewRefreshScheduler()
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
    <div ref="previewShellRef" :style="previewShellStyle" class="wj-preview-theme backface-hidden pos-relative w-full p-2 before:table before:content-['']" :class="`code-theme-${codeTheme} preview-theme-${previewTheme}`">
      <div ref="previewRef" class="wj-scrollbar w-full" />
    </div>
  </a-watermark>
  <div class="hidden">
    <a-image-preview-group :preview="{ getContainer: getImagePreviewContainer, visible: imagePreviewVisible, onVisibleChange: (visible) => { imagePreviewVisible = visible }, current: imagePreviewCurrentIndex }">
      <a-image v-for="(item, index) in imageSrcList" :key="index" :src="item" />
    </a-image-preview-group>
  </div>
</template>
