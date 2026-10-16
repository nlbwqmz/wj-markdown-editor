<script setup>
import { computed, isRef, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconButton from '@/components/editor/IconButton.vue'
import commonUtil from '@/util/commonUtil.js'
import {
  normalizeHashAnchor,
  scrollPreviewToAnchor,
} from '@/util/editor/previewAnchorScrollUtil.js'
import { isFirstScreenReady, STARTUP_LOADING_READY_EVENT } from '@/util/startupLoadingUtil.js'
import {
  flattenMarkdownMenuAnchors,
  resolveMarkdownMenuActiveHref,
  resolveMarkdownMenuActiveHrefByLineNumber,
  resolveMarkdownMenuTargetScrollTop,
  resolveMarkdownMenuTypography,
} from './markdownMenuUtil.js'

const props = defineProps({
  anchorList: {
    type: Array,
    default: () => [],
  },
  getContainer: {
    type: Function,
    default: () => document.body,
  },
  close: {
    type: Function,
    default: null,
  },
  showHeader: {
    type: Boolean,
    default: true,
  },
  activeLineNumber: {
    type: Number,
    default: null,
  },
})
const emits = defineEmits(['anchorNavigate'])

const menuItemElementMap = Object.create(null)
// 组件卸载后可能仍有已排队的动画帧回调，用它拦掉卸载后的测量与高亮更新。
let isDisposed = false
let currentContainer = null
let headingTargetElementMap = new Map()
let currentContainerMutationObserver = null
let pendingHeadingTargetRefresh = false
// 程序化滚动保护的超时上限：超过后强制解除，避免平滑滚动被打断（用户手动滚动等）时
// 保护永久卡死，导致目录高亮从此不再更新。
const PROGRAMMATIC_SCROLL_PROTECT_MS = 1500
let isProgrammaticScrolling = false
let programmaticScrollTargetTop = null
let programmaticScrollTimeout = null
let startupMeasureFallbackTimer = null
const activeHref = ref('')

const flattenedAnchorList = computed(() => flattenMarkdownMenuAnchors(props.anchorList))

function resolveMenuContainer() {
  const candidate = props.getContainer?.()
  if (isRef(candidate)) {
    return candidate.value ?? null
  }

  return candidate ?? null
}

function clearHeadingTargetElementMap() {
  headingTargetElementMap = new Map()
}

function rebuildHeadingTargetElementMap(container) {
  if (!container?.querySelectorAll) {
    clearHeadingTargetElementMap()
    return
  }

  // 目录滚动联动会频繁读取标题位置，这里先把 href 对应的真实标题元素缓存下来，
  // 避免在每次 scroll 时都重新全量扫描预览 DOM。
  // 大文档下大纲项与锚点候选数量都很大，必须先建索引再逐个查询；
  // 若对每个大纲项重新扫描候选列表会退化为 O(n²)（1MB 文档实测可达数秒）。
  const candidateList = Array.from(container.querySelectorAll('[id], a[name]'))
  const anchorElementMap = new Map()
  for (const candidate of candidateList) {
    const rawAnchorValue = candidate?.id || candidate?.getAttribute?.('name') || ''
    if (!rawAnchorValue) {
      continue
    }
    for (const anchorValue of normalizeHashAnchor(`#${rawAnchorValue}`)) {
      if (anchorElementMap.has(anchorValue) !== true) {
        anchorElementMap.set(anchorValue, candidate)
      }
    }
  }

  const nextHeadingTargetElementMap = new Map()
  flattenedAnchorList.value.forEach((item) => {
    for (const anchorValue of normalizeHashAnchor(item.href)) {
      const targetElement = anchorElementMap.get(anchorValue)
      if (targetElement) {
        nextHeadingTargetElementMap.set(item.href, targetElement)
        return
      }
    }
  })

  headingTargetElementMap = nextHeadingTargetElementMap
}

function resolveAnchorTarget(href) {
  return headingTargetElementMap.get(href) ?? null
}

function getContainerHeadingRecords(container) {
  if (!container?.getBoundingClientRect) {
    return []
  }

  const containerRect = container.getBoundingClientRect()

  return flattenedAnchorList.value
    .map((item) => {
      const targetElement = resolveAnchorTarget(item.href)
      if (!targetElement?.getBoundingClientRect) {
        return null
      }

      const targetRect = targetElement.getBoundingClientRect()
      return {
        href: item.href,
        top: resolveMarkdownMenuTargetScrollTop({
          containerTop: containerRect.top,
          containerScrollTop: container.scrollTop,
          containerClientTop: container.clientTop,
          targetTop: targetRect.top,
        }),
      }
    })
    .filter(Boolean)
}

function disconnectContainerMutationObserver() {
  currentContainerMutationObserver?.disconnect?.()
  currentContainerMutationObserver = null
}

function scheduleHeadingTargetRefresh() {
  if (pendingHeadingTargetRefresh === true) {
    return
  }

  pendingHeadingTargetRefresh = true
  nextTick(() => {
    pendingHeadingTargetRefresh = false
    if (!currentContainer) {
      clearHeadingTargetElementMap()
      return
    }

    rebuildHeadingTargetElementMap(currentContainer)
    if (isProgrammaticScrolling !== true) {
      scheduleActiveHrefUpdate()
    }
  })
}

function observeContainerMutations(container) {
  disconnectContainerMutationObserver()
  if (!container || typeof MutationObserver !== 'function') {
    return
  }

  currentContainerMutationObserver = new MutationObserver(() => {
    scheduleHeadingTargetRefresh()
  })
  currentContainerMutationObserver.observe(container, {
    childList: true,
    subtree: true,
  })
}

function syncActiveMenuItemIntoView(href) {
  if (!href) {
    return
  }

  nextTick(() => {
    menuItemElementMap[href]?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
  })
}

function setCurrentActiveHref(href) {
  if (href === activeHref.value) {
    return
  }

  activeHref.value = href
  syncActiveMenuItemIntoView(href)
}

function stopProgrammaticScroll() {
  isProgrammaticScrolling = false
  programmaticScrollTargetTop = null
  if (programmaticScrollTimeout !== null) {
    clearTimeout(programmaticScrollTimeout)
    programmaticScrollTimeout = null
  }
}

function resolveReachableProgrammaticScrollTarget(container, targetScrollTop) {
  const numericTargetScrollTop = Number.isFinite(targetScrollTop) ? targetScrollTop : 0
  const maxScrollTop = Math.max(0, (container?.scrollHeight ?? 0) - (container?.clientHeight ?? 0))
  return Math.min(Math.max(numericTargetScrollTop, 0), maxScrollTop)
}

function shouldFinishProgrammaticScroll(container) {
  if (!container || Number.isFinite(programmaticScrollTargetTop) !== true) {
    return true
  }

  // smooth scroll 过程中浏览器可能因为到达底部而 clamp，也可能是向上滚动。
  // 这里统一按“是否已经接近可达目标位置”判断结束，避免只对向下滚动生效。
  return Math.abs(container.scrollTop - programmaticScrollTargetTop) <= 5
}

// 首屏就绪前不计算目录高亮：此时预览 DOM 仍在渲染，读取标题位置会强制浏览器全量排版，
// 且排版结果会随首屏内容继续变化而失效，属于白做的开销。
// 首屏就绪事件或兜底定时器打开这道门之后，才允许读取标题位置并计算高亮。
let headingMeasureEnabled = false

// 目录高亮的测量统一延后到下一帧：预览 DOM 刚变更（或首屏刚就绪）时立即读取标题位置
// 会强制浏览器全量同步排版，大文档下可达秒级，阻塞首帧绘制。
let activeHrefUpdateRafId = null

function cancelScheduledActiveHrefUpdate() {
  if (activeHrefUpdateRafId !== null) {
    cancelAnimationFrame(activeHrefUpdateRafId)
    activeHrefUpdateRafId = null
  }
}

function scheduleActiveHrefUpdate() {
  if (isDisposed === true) {
    return
  }
  if (activeHrefUpdateRafId !== null) {
    return
  }

  activeHrefUpdateRafId = requestAnimationFrame(() => {
    activeHrefUpdateRafId = null
    updateActiveHref()
  })
}

function enableHeadingMeasure() {
  if (headingMeasureEnabled) {
    return
  }

  headingMeasureEnabled = true
  // 补算一次，否则门打开前挂载的目录会一直保持无高亮状态。
  scheduleActiveHrefUpdate()
}

function updateActiveHref() {
  if (isDisposed === true) {
    return
  }
  if (!headingMeasureEnabled) {
    return
  }

  // 无预览容器时，编辑区滚动只能提供行号，这里走行号驱动的活动项判定。
  if (Number.isFinite(props.activeLineNumber)) {
    setCurrentActiveHref(resolveMarkdownMenuActiveHrefByLineNumber({
      anchorList: flattenedAnchorList.value,
      lineNumber: props.activeLineNumber,
    }))
    return
  }

  const container = resolveMenuContainer()
  if (!container) {
    setCurrentActiveHref('')
    return
  }

  const headingRecords = getContainerHeadingRecords(container)
  const nextActiveHref = resolveMarkdownMenuActiveHref({
    headingRecords,
    scrollTop: container.scrollTop,
    clientHeight: container.clientHeight,
    scrollHeight: container.scrollHeight,
  })

  setCurrentActiveHref(nextActiveHref)
}

const syncActiveHref = commonUtil.debounce(() => {
  if (isProgrammaticScrolling) {
    if (shouldFinishProgrammaticScroll(resolveMenuContainer()) === true) {
      stopProgrammaticScroll()
      updateActiveHref()
    }
    return
  }

  updateActiveHref()
}, 60)

function startProgrammaticScroll(container, targetScrollTop) {
  stopProgrammaticScroll()
  const reachableTargetScrollTop = resolveReachableProgrammaticScrollTarget(container, targetScrollTop)
  isProgrammaticScrolling = true
  programmaticScrollTargetTop = reachableTargetScrollTop
  // 保护超时兜底：平滑滚动被打断（用户手动滚动等）导致永远到不了目标时，
  // 强制解除保护并补算一次高亮，避免目录高亮永久停止更新。
  programmaticScrollTimeout = setTimeout(() => {
    programmaticScrollTimeout = null
    if (isProgrammaticScrolling !== true) {
      return
    }
    stopProgrammaticScroll()
    updateActiveHref()
  }, PROGRAMMATIC_SCROLL_PROTECT_MS)
  if (Math.abs((container?.scrollTop ?? 0) - reachableTargetScrollTop) < 1) {
    stopProgrammaticScroll()
    updateActiveHref()
  }
}

function bindContainer() {
  const nextContainer = resolveMenuContainer()
  currentContainer?.removeEventListener?.('scroll', syncActiveHref)
  disconnectContainerMutationObserver()
  if (currentContainer !== nextContainer) {
    stopProgrammaticScroll()
  }
  currentContainer = nextContainer
  rebuildHeadingTargetElementMap(currentContainer)
  currentContainer?.addEventListener?.('scroll', syncActiveHref)
  observeContainerMutations(currentContainer)
  // 目录列表更新发生在预览 DOM 刚变更之后，此时立即测量标题位置会强制全量同步排版；
  // 延后到下一帧再补算高亮。
  scheduleActiveHrefUpdate()
}

function setMenuItemRef(href, element) {
  if (element) {
    menuItemElementMap[href] = element
    return
  }

  delete menuItemElementMap[href]
}

function isActiveHref(href) {
  return activeHref.value === href
}

function resolveMenuItemStyle(item) {
  const typography = resolveMarkdownMenuTypography(item?.level)
  return {
    '--wj-markdown-menu-depth': item.depth,
    '--wj-markdown-menu-font-size': typography.fontSize,
    '--wj-markdown-menu-font-weight': typography.fontWeight,
  }
}

function onAnchorClick(event, item) {
  event.preventDefault()

  const href = item?.href
  if (!href) {
    return
  }

  const previewRoot = resolveMenuContainer()
  const targetElement = resolveAnchorTarget(href)
  const scrollResult = scrollPreviewToAnchor({
    previewRoot,
    previewScrollContainer: previewRoot,
    href,
    targetElement,
  })
  if (!scrollResult) {
    // 无预览容器时没有可滚动的预览区，但仍需把锚点行号上抛给编辑页跳转。
    if (Number.isFinite(props.activeLineNumber)) {
      setCurrentActiveHref(href)
      emits('anchorNavigate', {
        didPreviewScroll: false,
        href,
        lineStart: item?.lineStart,
        lineEnd: item?.lineEnd,
      })
    }
    return
  }

  setCurrentActiveHref(href)
  startProgrammaticScroll(scrollResult.container, scrollResult.targetTop)
  const didPreviewScroll = Math.abs(
    (scrollResult.sourceTop ?? 0) - resolveReachableProgrammaticScrollTarget(scrollResult.container, scrollResult.targetTop),
  ) >= 1
  emits('anchorNavigate', {
    didPreviewScroll,
    href,
    lineStart: item?.lineStart,
    lineEnd: item?.lineEnd,
  })
}

watch(() => props.activeLineNumber, () => {
  updateActiveHref()
})

watch(() => props.anchorList, () => {
  nextTick(() => {
    bindContainer()
  })
})

watch(resolveMenuContainer, () => {
  nextTick(() => {
    bindContainer()
  })
})

onMounted(() => {
  bindContainer()
  if (isFirstScreenReady()) {
    // 组件在首屏就绪之后才挂载（例如切换视图），直接启用
    enableHeadingMeasure()
    return
  }

  window.addEventListener(STARTUP_LOADING_READY_EVENT, enableHeadingMeasure, { once: true })
  // 兜底：就绪信号异常时，15 秒后强制启用，避免目录高亮永远不工作
  startupMeasureFallbackTimer = setTimeout(enableHeadingMeasure, 15 * 1000)
})

onBeforeUnmount(() => {
  isDisposed = true
  cancelScheduledActiveHrefUpdate()
  window.removeEventListener(STARTUP_LOADING_READY_EVENT, enableHeadingMeasure)
  if (startupMeasureFallbackTimer !== null) {
    clearTimeout(startupMeasureFallbackTimer)
    startupMeasureFallbackTimer = null
  }
  currentContainer?.removeEventListener?.('scroll', syncActiveHref)
  disconnectContainerMutationObserver()
  stopProgrammaticScroll()
  currentContainer = null
})
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden">
    <div
      v-if="showHeader"
      class="flex items-center b-b-1 b-b-border-primary b-b-solid p-1 font-size-3.5"
      :class="close ? 'justify-between' : 'justify-center'"
    >
      <div class="select-none color-text-secondary">
        {{ $t('outline') }}
      </div>
      <IconButton
        v-if="close"
        :label="$t('close')"
        icon="i-tabler:x"
        :action="close"
      />
    </div>
    <div class="wj-scrollbar relative h-0 h-full flex-1 overflow-y-auto p-b-2 p-l-3 p-r-3 p-t-2">
      <div v-if="flattenedAnchorList.length === 0" class="h-full flex items-center justify-center">
        <a-empty>
          <template #description>
            <span class="color-gray-500">{{ $t('noOutline') }}</span>
          </template>
        </a-empty>
      </div>
      <div v-else class="flex flex-col gap-1">
        <button
          v-for="item in flattenedAnchorList"
          :key="item.key"
          :ref="element => setMenuItemRef(item.href, element)"
          type="button"
          class="markdown-menu__item cursor-pointer"
          :class="{ 'markdown-menu__item--active': isActiveHref(item.href) }"
          :style="resolveMenuItemStyle(item)"
          data-testid="markdown-menu-item"
          :data-href="item.href"
          :data-depth="String(item.depth)"
          :data-level="String(item.level)"
          :data-active="String(isActiveHref(item.href))"
          :title="item.title"
          @click="event => onAnchorClick(event, item)"
        >
          <span v-if="item.titleHtml" class="markdown-menu__item-text" v-html="item.titleHtml" />
          <span v-else class="markdown-menu__item-text">{{ item.title }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.markdown-menu__item {
  position: relative;
  display: block;
  width: 100%;
  min-height: 30px;
  padding: 0 10px 0 calc(10px + var(--wj-markdown-menu-depth) * 14px);
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--wj-markdown-text-secondary);
  font-size: var(--wj-markdown-menu-font-size);
  font-weight: var(--wj-markdown-menu-font-weight);
  text-align: left;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--wj-markdown-bg-hover);
    color: var(--wj-markdown-text-primary);
  }
}

.markdown-menu__item--active {
  background: var(--wj-markdown-bg-secondary);
  color: var(--wj-markdown-text-primary);

  &::before {
    position: absolute;
    top: 5px;
    bottom: 5px;
    left: 0;
    width: 3px;
    border-radius: 999px;
    background: var(--wj-markdown-sash-hover);
    content: '';
  }
}

.markdown-menu__item-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 30px;

  :deep(code) {
    margin: 0 2px;
    border-radius: 4px;
    background: var(--wj-markdown-bg-secondary);
    padding: 1px 4px;
    font-size: 0.92em;
  }

  :deep(strong),
  :deep(b) {
    font-weight: 700;
  }

  :deep(em),
  :deep(i) {
    font-style: italic;
  }

  :deep(s),
  :deep(del) {
    text-decoration: line-through;
  }

  :deep(mark) {
    border-radius: 3px;
    background: color-mix(in srgb, var(--wj-markdown-bg-hover) 75%, transparent);
    padding: 0 2px;
  }

  :deep(ins) {
    text-decoration: underline;
  }

  :deep(u) {
    text-decoration: underline;
  }

  :deep(sub),
  :deep(sup) {
    font-size: 0.75em;
    line-height: 0;
  }
}
</style>
