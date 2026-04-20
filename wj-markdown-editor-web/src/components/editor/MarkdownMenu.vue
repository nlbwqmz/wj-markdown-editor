<script setup>
import { computed, isRef, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconButton from '@/components/editor/IconButton.vue'
import commonUtil from '@/util/commonUtil.js'
import {
  findPreviewAnchorTarget,
  scrollPreviewToAnchor,
} from '@/util/editor/previewAnchorScrollUtil.js'
import {
  flattenMarkdownMenuAnchors,
  resolveMarkdownMenuActiveHref,
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
})
const emits = defineEmits(['anchorNavigate'])

const menuItemElementMap = Object.create(null)
let currentContainer = null
let headingTargetElementMap = new Map()
let currentContainerMutationObserver = null
let pendingHeadingTargetRefresh = false
let isProgrammaticScrolling = false
let programmaticScrollTargetTop = null
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
  const candidateList = Array.from(container.querySelectorAll('[id], a[name]'))
  const nextHeadingTargetElementMap = new Map()

  flattenedAnchorList.value.forEach((item) => {
    const targetElement = findPreviewAnchorTarget({
      previewRoot: container,
      href: item.href,
      candidateList,
    })

    if (targetElement) {
      nextHeadingTargetElementMap.set(item.href, targetElement)
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
      updateActiveHref()
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

function updateActiveHref() {
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
  updateActiveHref()
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
    return
  }

  setCurrentActiveHref(href)
  startProgrammaticScroll(scrollResult.container, scrollResult.targetTop)
  emits('anchorNavigate', {
    href,
    lineStart: item?.lineStart,
    lineEnd: item?.lineEnd,
  })
}

watch(() => props.anchorList, () => {
  nextTick(() => {
    bindContainer()
  })
}, { deep: true })

watch(resolveMenuContainer, () => {
  nextTick(() => {
    bindContainer()
  })
})

onMounted(() => {
  bindContainer()
})

onBeforeUnmount(() => {
  currentContainer?.removeEventListener?.('scroll', syncActiveHref)
  disconnectContainerMutationObserver()
  stopProgrammaticScroll()
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
          <span class="markdown-menu__item-text">{{ item.title }}</span>
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
}
</style>
