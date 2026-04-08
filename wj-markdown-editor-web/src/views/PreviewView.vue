<script setup>
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import Split from 'split-grid'
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useViewScrollAnchor } from '@/components/editor/composables/useViewScrollAnchor.js'
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import PreviewAssetContextMenu from '@/components/editor/PreviewAssetContextMenu.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import { syncClosePromptSnapshot } from '@/util/channel/closePromptSyncService.js'
import eventEmit from '@/util/channel/eventEmit.js'
import commonUtil from '@/util/commonUtil.js'
import { setCurrentWindowOpenPreparationProvider } from '@/util/document-session/currentWindowOpenPreparationService.js'
import {
  DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
} from '@/util/document-session/documentSessionEventUtil.js'
import {
  getDocumentSessionSnapshotIdentity,
} from '@/util/document-session/documentSessionSnapshotUtil.js'
import {
  requestDocumentSessionSnapshot,
} from '@/util/document-session/rendererDocumentCommandUtil.js'
import {
  resolveRendererSessionActivationAction,
  shouldBootstrapSessionSnapshotOnMounted,
} from '@/util/document-session/rendererSessionActivationStrategy.js'
import { createRendererSessionEventSubscription } from '@/util/document-session/rendererSessionEventSubscription.js'
import { createRendererSessionSnapshotController } from '@/util/document-session/rendererSessionSnapshotController.js'
import { preparePreviewAssetCopyImagePayload } from '@/util/editor/previewAssetCopyImageActionUtil.js'
import { createPreviewAssetSessionController } from '@/util/editor/previewAssetSessionController.js'
import { buildPreviewContextMenuItems } from '@/util/editor/previewContextMenuActionUtil.js'
import {
  capturePreviewLineAnchor,
  resolvePreviewLineAnchorScrollTop,
} from '@/util/editor/viewScrollAnchorMathUtil.js'
import { createViewScrollAnchorSessionStore } from '@/util/editor/viewScrollAnchorSessionUtil.js'
import { previewSearchBarController } from '@/util/searchBarController.js'
import { closeSearchBarIfVisible } from '@/util/searchBarLifecycleUtil.js'
import { createSearchTargetBridge } from '@/util/searchTargetBridgeUtil.js'
import { collectSearchTargetElements } from '@/util/searchTargetUtil.js'

// 纯预览页的资源右键菜单状态。
// 菜单关闭时重建对象，避免保留过期的 asset 或 actionContext。
function createPreviewAssetMenuState() {
  return {
    open: false,
    x: 0,
    y: 0,
    asset: null,
    actionContext: null,
    items: [],
  }
}

const router = useRouter()
const { t } = useI18n()

const store = useCommonStore()

const content = ref('')
const anchorList = ref([])
let splitInstance
const gutterRef = ref()
const previewContainerRef = ref()
const menuVisible = ref(false)
const menuController = ref(false)
const previewContainer = ref()
const config = ref({})
const ready = ref(false)
// 预览页自己的滚动恢复只依赖当前视图实例内的局部缓存，不和编辑页共用 store。
const previewPageAnchorStore = createViewScrollAnchorSessionStore()
let pendingRestoreOnActivation = false
const watermark = ref()
const previewAssetMenu = ref(createPreviewAssetMenuState())
const currentScrollSnapshot = ref({
  sessionId: '',
  revision: 0,
})
const previewAssetSessionController = createPreviewAssetSessionController({
  onContextInvalidated: () => {
    closePreviewAssetMenu()
  },
})
const previewSessionSnapshotController = createRendererSessionSnapshotController({
  applySnapshot: (snapshot) => {
    applyDocumentSessionSnapshot(snapshot)
  },
  promptRecentMissing: commonUtil.recentFileNotExists,
  syncClosePrompt: syncClosePromptSnapshot,
  store,
})
let clearCurrentWindowOpenPreparationProvider = null

function getPreviewSearchTargetElements() {
  return collectSearchTargetElements(previewContainer.value)
}
const previewSearchTargetBridge = createSearchTargetBridge({
  controller: previewSearchBarController,
  getTargetElements: () => getPreviewSearchTargetElements(),
})

function closePreviewSearchBar() {
  closeSearchBarIfVisible({
    controller: previewSearchBarController,
    store,
  })
}

// 纯预览页没有编辑器实例时，只暴露稳定快照降级能力。
async function requestCurrentWindowOpenPreparation() {
  const snapshot = await requestDocumentSessionSnapshot()
  return {
    ok: true,
    reason: 'prepared',
    snapshot,
  }
}

function bindCurrentWindowOpenPreparationProvider() {
  clearCurrentWindowOpenPreparationProvider?.()
  clearCurrentWindowOpenPreparationProvider = setCurrentWindowOpenPreparationProvider(requestCurrentWindowOpenPreparation)
}

function clearBoundCurrentWindowOpenPreparationProvider() {
  clearCurrentWindowOpenPreparationProvider?.()
  clearCurrentWindowOpenPreparationProvider = null
}

// 关闭纯预览页的资源右键菜单，并清空冻结的 actionContext。
function closePreviewAssetMenu() {
  previewAssetMenu.value = createPreviewAssetMenuState()
}

// 统一提取 runtime 返回的结构化失败文案。
function getPreviewAssetActionFailureMessageKey(result) {
  if (typeof result?.messageKey === 'string' && result.messageKey) {
    return result.messageKey
  }

  if (typeof result?.error?.messageKey === 'string' && result.error.messageKey) {
    return result.error.messageKey
  }

  return null
}

// 资源动作失败时优先展示 runtime 返回的 messageKey。
function showPreviewAssetActionFailure(result, options = {}) {
  const messageKey = getPreviewAssetActionFailureMessageKey(result)
  if (messageKey) {
    message.warning(t(messageKey))
    return
  }

  const fallbackMessageKey = typeof options.fallbackMessageKey === 'string'
    ? options.fallbackMessageKey
    : null
  if (fallbackMessageKey) {
    message.error(t(fallbackMessageKey))
  }
}

// 菜单动作必须绑定在菜单打开时冻结的 actionContext 上。
// 只要上下文失效，就立即关闭菜单并放弃对旧文档的命令发送。
function resolvePreviewAssetMenuActionTarget(options = {}) {
  const assetInfo = previewAssetMenu.value.asset
  const actionContext = previewAssetMenu.value.actionContext
  const requireResourceUrl = options.requireResourceUrl !== false
  if (!assetInfo || previewAssetSessionController.isActiveContext(actionContext) !== true) {
    closePreviewAssetMenu()
    return null
  }

  if (requireResourceUrl && !assetInfo.resourceUrl) {
    closePreviewAssetMenu()
    return null
  }

  return {
    assetInfo,
    actionContext,
    requestContext: previewAssetSessionController.createRequestContext(actionContext),
  }
}

// 复制/另存为命令统一沿用同一份资源 payload。
function createPreviewAssetRuntimePayload(actionTarget) {
  return {
    sourceType: actionTarget.assetInfo?.sourceType ?? null,
    resourceUrl: actionTarget.assetInfo?.resourceUrl ?? null,
    rawSrc: actionTarget.assetInfo?.rawSrc ?? null,
    rawPath: actionTarget.assetInfo?.rawPath ?? null,
    requestContext: actionTarget.requestContext,
  }
}

// 文本复制在 runtime 与本地剪贴板之间跨了两段异步，
// 每次 await 结束后都要确认当前动作上下文还有效，避免 stale toast。
async function writePreviewAssetTextWithContext(options = {}) {
  const actionContext = options.actionContext
  if (previewAssetSessionController.isActiveContext(actionContext) !== true) {
    closePreviewAssetMenu()
    return
  }

  const text = typeof options.text === 'string' ? options.text : ''
  if (!text) {
    message.error(t('message.copyFailed'))
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    if (previewAssetSessionController.isActiveContext(actionContext) !== true) {
      return
    }
    message.success(t('message.copySucceeded'))
  } catch {
    if (previewAssetSessionController.isActiveContext(actionContext) !== true) {
      return
    }
    message.error(t('message.copyFailed'))
  }
}

// 统一处理“runtime 返回文本，再由 renderer 写入文本剪贴板”的动作。
async function copyPreviewAssetTextFromRuntime(runtimeEvent) {
  const actionTarget = resolvePreviewAssetMenuActionTarget()
  if (!actionTarget) {
    return
  }

  const result = await channelUtil.send({
    event: runtimeEvent,
    data: createPreviewAssetRuntimePayload(actionTarget),
  })
  if (previewAssetSessionController.isActiveContext(actionTarget.actionContext) !== true) {
    closePreviewAssetMenu()
    return
  }

  if (result?.ok === true) {
    await writePreviewAssetTextWithContext({
      text: result.text,
      actionContext: actionTarget.actionContext,
    })
    return
  }

  showPreviewAssetActionFailure(result, {
    fallbackMessageKey: 'message.copyFailed',
  })
}

/**
 * 统一更新当前预览页滚动恢复所绑定的快照身份。
 *
 * @param {object | null | undefined} snapshot
 */
function updateCurrentScrollSnapshot(snapshot) {
  const snapshotIdentity = getDocumentSessionSnapshotIdentity(snapshot)

  currentScrollSnapshot.value = {
    sessionId: snapshotIdentity.sessionId || '',
    revision: snapshotIdentity.revision,
  }
}

/**
 * 统一设置滚动容器位置。
 * 优先走 scrollTo，便于真实 DOM 与测试桩共享同一套写回逻辑。
 *
 * @param {{ scrollTop?: number, scrollTo?: Function } | null | undefined} scrollElement
 * @param {number} targetScrollTop
 */
function setScrollElementScrollTop(scrollElement, targetScrollTop) {
  if (!scrollElement || Number.isFinite(targetScrollTop) !== true) {
    return
  }

  if (typeof scrollElement.scrollTo === 'function') {
    scrollElement.scrollTo({ top: targetScrollTop })
    return
  }

  scrollElement.scrollTop = targetScrollTop
}

/**
 * 解析预览元素的 Markdown 行号。
 *
 * @param {unknown} value
 * @returns {number | null} 返回合法行号；非法值返回 null。
 */
function parsePreviewLineNumber(value) {
  const lineNumber = Number(value)

  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    return null
  }

  return lineNumber
}

/**
 * 读取预览节点携带的 Markdown 行范围。
 *
 * @param {{ dataset?: Record<string, string> } | null | undefined} element
 * @returns {{ lineStart: number, lineEnd: number } | null} 返回合法行范围；缺失时返回 null。
 */
function getPreviewElementLineRange(element) {
  const lineStart = parsePreviewLineNumber(element?.dataset?.lineStart)
  if (lineStart === null) {
    return null
  }

  const parsedLineEnd = parsePreviewLineNumber(element?.dataset?.lineEnd)
  const lineEnd = parsedLineEnd ?? lineStart

  return {
    lineStart,
    lineEnd: Math.max(lineStart, lineEnd),
  }
}

/**
 * 计算预览节点相对滚动容器内容顶部的真实位置。
 *
 * @param {HTMLElement | null | undefined} container
 * @param {HTMLElement | null | undefined} element
 * @returns {number | null} 返回真实顶部位置；无法计算时返回 null。
 */
function getPreviewElementToTopDistance(container, element) {
  if (!container || !element) {
    return null
  }

  const containerRect = container.getBoundingClientRect?.()
  const elementRect = element.getBoundingClientRect?.()
  if (!Number.isFinite(containerRect?.top) || !Number.isFinite(elementRect?.top)) {
    return null
  }

  return elementRect.top - containerRect.top - container.clientTop + container.scrollTop
}

/**
 * 当多个节点映射到同一段 Markdown 时，优先选择更内层的真实内容节点。
 *
 * @param {HTMLElement | null | undefined} element
 * @returns {number} 返回节点相对滚动容器的嵌套深度。
 */
function getPreviewElementDepth(element) {
  let depth = 0
  let current = element

  while (current && current !== previewContainerRef.value) {
    depth++
    current = current.parentElement
  }

  return depth
}

/**
 * 获取纯预览页中所有带行号映射的节点。
 *
 * @returns {HTMLElement[]} 返回当前滚动容器内可用于锚点计算的节点列表。
 */
function getPreviewAnchorElements() {
  if (!previewContainerRef.value) {
    return []
  }

  return Array.from(previewContainerRef.value.querySelectorAll('[data-line-start]'))
}

/**
 * 根据当前 scrollTop 找到最接近顶部的预览节点。
 *
 * @param {HTMLElement} container
 * @param {number} scrollTop
 * @returns {HTMLElement | null} 返回当前位置对应的预览节点。
 */
function findPreviewElementAtScrollTop(container, scrollTop) {
  const elements = getPreviewAnchorElements()
  let target = elements[0] ?? null

  for (const element of elements) {
    const elementTop = getPreviewElementToTopDistance(container, element)
    if (Number.isFinite(elementTop) && elementTop <= scrollTop) {
      target = element
    } else {
      break
    }
  }

  return target
}

/**
 * 按锚点中的 Markdown 行范围反查当前预览节点。
 *
 * @param {HTMLElement} container
 * @param {{ lineStart?: number, lineEnd?: number } | null | undefined} anchor
 * @returns {HTMLElement | null} 返回命中的预览节点；找不到时返回 null。
 */
function findPreviewElementByAnchor(container, anchor) {
  const lineStart = parsePreviewLineNumber(anchor?.lineStart)
  const lineEnd = parsePreviewLineNumber(anchor?.lineEnd) ?? lineStart

  if (!container || lineStart === null || lineEnd === null) {
    return null
  }

  const waiting = []
  for (const element of getPreviewAnchorElements()) {
    const lineRange = getPreviewElementLineRange(element)
    if (!lineRange) {
      continue
    }
    if (lineRange.lineStart === lineStart && lineRange.lineEnd === lineEnd) {
      waiting.push({
        element,
        depth: getPreviewElementDepth(element),
        span: lineRange.lineEnd - lineRange.lineStart,
      })
    }
  }

  waiting.sort((a, b) => {
    const spanCompare = a.span - b.span
    if (spanCompare !== 0) {
      return spanCompare
    }
    return b.depth - a.depth
  })

  return waiting[0]?.element ?? null
}

const previewPageScrollAnchor = useViewScrollAnchor({
  store: previewPageAnchorStore,
  sessionIdGetter: () => currentScrollSnapshot.value.sessionId,
  revisionGetter: () => currentScrollSnapshot.value.revision,
  scrollAreaKey: 'preview-page',
  getScrollElement: () => previewContainerRef.value ?? null,
  captureAnchor: ({ scrollElement }) => {
    if (!scrollElement) {
      return null
    }

    const targetElement = findPreviewElementAtScrollTop(scrollElement, scrollElement.scrollTop)
    if (!targetElement) {
      return null
    }

    return capturePreviewLineAnchor({
      container: scrollElement,
      element: targetElement,
      scrollTop: scrollElement.scrollTop,
    })
  },
  restoreAnchor: ({ record, scrollElement }) => {
    if (!scrollElement) {
      return false
    }

    const targetElement = findPreviewElementByAnchor(scrollElement, record?.anchor)
    const targetScrollTop = resolvePreviewLineAnchorScrollTop({
      container: scrollElement,
      element: targetElement,
      anchor: record?.anchor,
      fallbackScrollTop: record?.fallbackScrollTop,
    })

    setScrollElementScrollTop(scrollElement, targetScrollTop)
    return true
  },
})

function applyDocumentSessionSnapshot(snapshot) {
  if (!snapshot) {
    return
  }

  previewAssetSessionController.syncSnapshot(snapshot)
  // 预览页只消费已经收敛完毕的 session snapshot，
  // 不直接参与保存态或外部修改态推导。
  content.value = snapshot.content
  ready.value = true
  if (!content.value) {
    anchorList.value = []
  }

  updateCurrentScrollSnapshot(snapshot)

  if (pendingRestoreOnActivation !== true) {
    return
  }

  pendingRestoreOnActivation = false
  nextTick(() => {
    previewPageScrollAnchor.scheduleRestoreForCurrentSnapshot().then(() => {})
  })
}

function onDocumentSessionSnapshotChanged(snapshot) {
  previewSessionSnapshotController.applyPushedSnapshot(snapshot)
}

const documentSessionSnapshotSubscription = createRendererSessionEventSubscription({
  eventName: DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
  listener: onDocumentSessionSnapshotChanged,
  addListener: (eventName, listener) => eventEmit.on(eventName, listener),
  removeListener: (eventName, listener) => eventEmit.remove(eventName, listener),
})

async function loadCurrentDocumentSessionSnapshot() {
  const requestContext = previewSessionSnapshotController.beginBootstrapRequest()
  const snapshot = await requestDocumentSessionSnapshot()
  previewSessionSnapshotController.applyBootstrapSnapshot(requestContext, snapshot)
}

watch(() => store.config, (newValue) => {
  // 水印
  const tempWatermark = JSON.parse(JSON.stringify(newValue.watermark))
  tempWatermark.content = tempWatermark.content ? tempWatermark.content : 'wj-markdown-editor'
  if (tempWatermark.dateEnabled === true) {
    tempWatermark.content = [tempWatermark.content, dayjs(new Date()).format(tempWatermark.datePattern)]
  }
  tempWatermark.enabled = tempWatermark.enabled && tempWatermark.previewEnabled
  watermark.value = tempWatermark
  config.value = newValue
}, { deep: true, immediate: true })

onMounted(() => {
  menuVisible.value = store.config.menuVisible
  bindCurrentWindowOpenPreparationProvider()
  previewSearchTargetBridge.activate()
  previewSessionSnapshotController.activate()
  documentSessionSnapshotSubscription.activate()
  if (shouldBootstrapSessionSnapshotOnMounted({
    insideKeepAlive: true,
  }) === true) {
    loadCurrentDocumentSessionSnapshot().then(() => {})
  }
})

onBeforeUnmount(() => {
  clearBoundCurrentWindowOpenPreparationProvider()
  previewSessionSnapshotController.dispose()
  documentSessionSnapshotSubscription.dispose()
  previewAssetSessionController.invalidateActiveContext({
    reason: 'before-unmount',
  })
  closePreviewAssetMenu()
  closePreviewSearchBar()
  previewSearchTargetBridge.deactivate({ preserveCleanupTarget: false })
})

watch(() => menuVisible.value, (newValue) => {
  closePreviewSearchBar()

  if (newValue) {
    menuController.value = true
    nextTick(() => {
      splitInstance = Split({
        columnGutters: [{ track: 1, element: gutterRef.value }],
        // 最小尺寸
        minSize: 200,
        // 自动吸附距离
        snapOffset: 0,
      })
    })
  } else {
    splitInstance.destroy(true)
    previewContainer.value.style['grid-template-columns'] = ''
    menuController.value = false
  }
})

onActivated(async () => {
  bindCurrentWindowOpenPreparationProvider()
  pendingRestoreOnActivation = true
  previewSessionSnapshotController.activate()
  documentSessionSnapshotSubscription.activate()
  previewSearchTargetBridge.activate()
  closePreviewSearchBar()
  const activationAction = resolveRendererSessionActivationAction({
    hasAppliedSnapshot: previewSessionSnapshotController.hasAppliedSnapshot?.() === true,
    needsBootstrapOnActivate: previewSessionSnapshotController.needsBootstrapOnActivate?.() === true,
    storeSnapshot: store.documentSessionSnapshot,
  })

  if (activationAction === 'replay-store') {
    // 预览页恢复时同样先吃全局 store 里的最新真快照，
    // 避免在别的视图已经把 store 推进到最新正文后，这里还继续空白等待补拉。
    previewSessionSnapshotController.replaySnapshot(store.documentSessionSnapshot)
    return
  }

  if (activationAction === 'request-bootstrap') {
    loadCurrentDocumentSessionSnapshot().then(() => {})
  }
})

onDeactivated(() => {
  clearBoundCurrentWindowOpenPreparationProvider()
  pendingRestoreOnActivation = false
  previewPageScrollAnchor.cancelPendingRestore()
  previewSessionSnapshotController.deactivate()
  documentSessionSnapshotSubscription.deactivate()
  previewAssetSessionController.invalidateActiveContext({
    reason: 'deactivated',
  })
  closePreviewAssetMenu()
  closePreviewSearchBar()
  previewSearchTargetBridge.deactivate()
})

onBeforeRouteLeave(() => {
  updateCurrentScrollSnapshot(store.documentSessionSnapshot)
  previewPageScrollAnchor.captureCurrentAnchor()
})

function toEdit() {
  router.push({
    name: 'editor',
  })
}

function onAnchorChange(changedAnchorList) {
  anchorList.value = changedAnchorList
}

function onPreviewRefreshComplete() {
  closePreviewSearchBar()
}

function onPreviewContextmenu(context) {
  if (!context?.asset) {
    closePreviewAssetMenu()
    return
  }

  previewAssetMenu.value = {
    open: true,
    x: context.menuPosition?.x ?? 0,
    y: context.menuPosition?.y ?? 0,
    asset: context.asset,
    actionContext: previewAssetSessionController.captureActionContext(),
    items: buildPreviewContextMenuItems({
      context,
      profile: 'standalone-preview',
      t,
    }),
  }
}

function onPreviewAssetMenuSelect(actionKey) {
  if (actionKey === 'resource.copy-absolute-path') {
    copyPreviewAssetAbsolutePath().then(() => {})
    return
  }

  if (actionKey === 'resource.copy-link') {
    copyPreviewAssetLink().then(() => {})
    return
  }

  if (actionKey === 'resource.copy-image') {
    copyPreviewAssetImage().then(() => {})
    return
  }

  if (actionKey === 'resource.save-as') {
    savePreviewAssetAs().then(() => {})
    return
  }

  if (actionKey === 'resource.open-in-folder') {
    openPreviewAssetInExplorer()
    return
  }

  if (actionKey === 'resource.copy-markdown-reference') {
    copyPreviewAssetMarkdownReference().then(() => {})
  }
}

async function copyPreviewAssetAbsolutePath() {
  await copyPreviewAssetTextFromRuntime('document.resource.copy-absolute-path')
}

async function copyPreviewAssetLink() {
  await copyPreviewAssetTextFromRuntime('document.resource.copy-link')
}

// 图片复制由 runtime 直接操作系统剪贴板，renderer 只负责提示结果。
async function copyPreviewAssetImage() {
  const actionTarget = resolvePreviewAssetMenuActionTarget()
  if (!actionTarget) {
    return
  }

  const preparedPayloadResult = await preparePreviewAssetCopyImagePayload({
    asset: actionTarget.assetInfo,
    menuPosition: previewAssetMenu.value,
    basePayload: createPreviewAssetRuntimePayload(actionTarget),
    closeMenu: closePreviewAssetMenu,
    waitForNextFrame: () => new Promise(resolve => requestAnimationFrame(() => resolve())),
    resolveElementFromPoint: (x, y) => document.elementFromPoint(x, y),
  })
  if (previewAssetSessionController.isActiveContext(actionTarget.actionContext) !== true) {
    closePreviewAssetMenu()
    return
  }

  if (preparedPayloadResult.ok !== true) {
    showPreviewAssetActionFailure({
      ok: false,
      reason: preparedPayloadResult.reason,
      messageKey: preparedPayloadResult.reason === 'copy-image-target-unavailable'
        ? 'message.previewAssetCopyImageTargetUnavailable'
        : 'message.previewAssetInvalidCopyImageTarget',
    })
    return
  }

  const result = await channelUtil.send({
    event: 'document.resource.copy-image',
    data: preparedPayloadResult.payload,
  })
  if (previewAssetSessionController.isActiveContext(actionTarget.actionContext) !== true) {
    closePreviewAssetMenu()
    return
  }

  if (result?.ok === true) {
    message.success(t('message.copySucceeded'))
    return
  }

  showPreviewAssetActionFailure(result, {
    fallbackMessageKey: 'message.copyFailed',
  })
}

async function savePreviewAssetAs() {
  const actionTarget = resolvePreviewAssetMenuActionTarget()
  if (!actionTarget) {
    return
  }

  const result = await channelUtil.send({
    event: 'document.resource.save-as',
    data: createPreviewAssetRuntimePayload(actionTarget),
  })
  if (previewAssetSessionController.isActiveContext(actionTarget.actionContext) !== true) {
    closePreviewAssetMenu()
    return
  }

  if (result?.ok === true) {
    message.success(t(result.messageKey || 'message.saveAsSuccessfully'))
    return
  }

  if (result?.ok === false && result.cancelled === true && result.reason === 'cancelled') {
    return
  }

  showPreviewAssetActionFailure(result, {
    fallbackMessageKey: 'message.saveAsFailed',
  })
}

async function copyPreviewAssetMarkdownReference() {
  const actionTarget = resolvePreviewAssetMenuActionTarget({
    requireResourceUrl: false,
  })
  if (!actionTarget) {
    return
  }

  const markdownReference = actionTarget.assetInfo?.markdownReference
  if (typeof markdownReference !== 'string') {
    message.error(t('message.copyFailed'))
    return
  }

  await writePreviewAssetTextWithContext({
    text: markdownReference,
    actionContext: actionTarget.actionContext,
  })
}

// 菜单动作必须使用菜单打开时冻结的 actionContext，避免文档切换后继续操作旧资源。
function openPreviewAssetInExplorer() {
  const actionTarget = resolvePreviewAssetMenuActionTarget()
  if (!actionTarget) {
    return
  }

  channelUtil.send({
    event: 'document.resource.open-in-folder',
    data: {
      resourceUrl: actionTarget.assetInfo.resourceUrl,
      rawPath: actionTarget.assetInfo.rawPath,
      requestContext: actionTarget.requestContext,
    },
  })
}

function onAssetOpen(assetInfo) {
  const actionContext = previewAssetSessionController.captureActionContext()
  if (!assetInfo?.resourceUrl || previewAssetSessionController.isActiveContext(actionContext) !== true) {
    return
  }

  channelUtil.send({
    event: 'document.resource.open-in-folder',
    data: {
      resourceUrl: assetInfo.resourceUrl,
      rawPath: assetInfo.rawPath,
      requestContext: previewAssetSessionController.createRequestContext(actionContext),
    },
  })
}

defineExpose({
  requestCurrentWindowOpenPreparation,
})
</script>

<template>
  <a-tooltip v-if="menuController === false" placement="right" color="#1677ff">
    <template #title>
      <span>{{ $t('outline') }}</span>
    </template>
    <div class="absolute left-0 z-10 flex cursor-pointer items-center p-1 op-60 hover:op-100" @click="() => { menuVisible = true }">
      <div class="i-tabler:menu-2" />
    </div>
  </a-tooltip>
  <div
    v-show="ready" ref="previewContainer"
    class="allow-search grid h-full w-full overflow-hidden b-t-1 b-t-border-primary b-t-solid"
    :class="menuController ? 'grid-cols-[200px_1px_1fr]' : 'grid-cols-[1fr]'"
  >
    <MarkdownMenu v-if="menuController" :anchor-list="anchorList" :get-container="() => previewContainerRef" :close="() => { menuVisible = false }" />
    <div v-if="menuController" ref="gutterRef" class="wj-sash wj-sash--vertical h-full" />
    <div v-if="content" ref="previewContainerRef" class="wj-scrollbar h-full w-full overflow-y-auto">
      <div class="h-full w-full flex justify-center">
        <div class="h-full w-full" :style="{ width: `${config.previewWidth}%` }">
          <MarkdownPreview
            :content="content"
            :code-theme="config.theme.code"
            :preview-theme="config.theme.preview"
            :preview-scroll-container="() => previewContainerRef"
            :watermark="watermark"
            @refresh-complete="onPreviewRefreshComplete"
            @anchor-change="onAnchorChange"
            @preview-contextmenu="onPreviewContextmenu"
            @asset-open="onAssetOpen"
          />
        </div>
      </div>
    </div>
    <div v-else class="h-full flex items-center justify-center">
      <a-empty>
        <template #description>
          <span>
            文档内容为空
          </span>
        </template>
        <a-button type="primary" ghost @click="toEdit">
          去编辑
        </a-button>
      </a-empty>
    </div>
  </div>
  <PreviewAssetContextMenu
    :open="previewAssetMenu.open"
    :x="previewAssetMenu.x"
    :y="previewAssetMenu.y"
    :items="previewAssetMenu.items"
    @close="closePreviewAssetMenu"
    @select="onPreviewAssetMenuSelect"
  />
</template>

<style scoped lang="scss">
</style>
