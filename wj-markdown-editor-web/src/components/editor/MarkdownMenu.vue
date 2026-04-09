<script setup>
import { computed, isRef, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import commonUtil from '@/util/commonUtil.js'
import {
  findPreviewAnchorTarget,
  resolvePreviewScrollContainer,
} from '@/util/editor/previewAnchorLinkScrollUtil.js'
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
})

const MARKDOWN_MENU_SCROLL_DURATION_MS = 450

const menuItemElementMap = Object.create(null)
let currentContainer = null
let scrollAnimationFrameId = null
let scrollAnimationToken = 0
let isProgrammaticScrolling = false
const activeHref = ref('')

const flattenedAnchorList = computed(() => flattenMarkdownMenuAnchors(props.anchorList))

function resolveMenuContainer() {
  const candidate = props.getContainer?.()
  if (isRef(candidate)) {
    return candidate.value ?? null
  }

  return candidate ?? null
}

function resolveAnchorTarget(previewRoot, href) {
  const targetElement = findPreviewAnchorTarget({
    previewRoot,
    href,
  })

  if (targetElement) {
    return targetElement
  }

  return previewRoot?.querySelector?.(href) ?? null
}

function getContainerHeadingRecords(container) {
  if (!container?.getBoundingClientRect) {
    return []
  }

  const containerRect = container.getBoundingClientRect()

  return flattenedAnchorList.value
    .map((item) => {
      const targetElement = resolveAnchorTarget(container, item.href)
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

function requestMenuAnimationFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(callback)
  }

  return globalThis.setTimeout(() => {
    callback(Date.now())
  }, 16)
}

function cancelMenuAnimationFrame(frameId) {
  if (frameId === null) {
    return
  }

  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(frameId)
    return
  }

  clearTimeout(frameId)
}

function easeInOutCubic(time, start, change, duration) {
  let normalizedTime = time / (duration / 2)
  if (normalizedTime < 1) {
    return (change / 2 * normalizedTime * normalizedTime * normalizedTime) + start
  }

  normalizedTime -= 2
  return (change / 2 * ((normalizedTime * normalizedTime * normalizedTime) + 2)) + start
}

function applyContainerScrollTop(container, scrollTop) {
  if (typeof container?.scrollTo === 'function') {
    container.scrollTo({ top: scrollTop })
    return
  }

  container.scrollTop = scrollTop
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
    return
  }

  updateActiveHref()
}, 60)

function stopProgrammaticScroll() {
  isProgrammaticScrolling = false
  scrollAnimationToken += 1
  if (scrollAnimationFrameId === null) {
    return
  }

  cancelMenuAnimationFrame(scrollAnimationFrameId)
  scrollAnimationFrameId = null
}

function startProgrammaticScroll(container, targetScrollTop) {
  stopProgrammaticScroll()

  const startScrollTop = container?.scrollTop ?? 0
  if (Math.abs(targetScrollTop - startScrollTop) < 1) {
    applyContainerScrollTop(container, targetScrollTop)
    updateActiveHref()
    return
  }

  const currentAnimationToken = scrollAnimationToken + 1
  scrollAnimationToken = currentAnimationToken
  isProgrammaticScrolling = true
  const startTime = Date.now()
  const changeInScrollTop = targetScrollTop - startScrollTop

  const tick = () => {
    if (currentAnimationToken !== scrollAnimationToken) {
      return
    }

    const elapsed = Math.max(0, Date.now() - startTime)
    const nextScrollTop = easeInOutCubic(
      Math.min(elapsed, MARKDOWN_MENU_SCROLL_DURATION_MS),
      startScrollTop,
      changeInScrollTop,
      MARKDOWN_MENU_SCROLL_DURATION_MS,
    )
    applyContainerScrollTop(container, nextScrollTop)

    if (elapsed < MARKDOWN_MENU_SCROLL_DURATION_MS) {
      scrollAnimationFrameId = requestMenuAnimationFrame(tick)
      return
    }

    scrollAnimationFrameId = null
    isProgrammaticScrolling = false
    applyContainerScrollTop(container, targetScrollTop)
    updateActiveHref()
  }

  scrollAnimationFrameId = requestMenuAnimationFrame(tick)
}

function bindContainer() {
  const nextContainer = resolveMenuContainer()
  currentContainer?.removeEventListener?.('scroll', syncActiveHref)
  if (currentContainer !== nextContainer) {
    stopProgrammaticScroll()
  }
  currentContainer = nextContainer
  currentContainer?.addEventListener?.('scroll', syncActiveHref)
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

function onAnchorClick(event, href) {
  event.preventDefault()

  const previewRoot = resolveMenuContainer()
  const container = resolvePreviewScrollContainer({
    previewRoot,
    previewScrollContainer: previewRoot,
  })
  const targetElement = resolveAnchorTarget(previewRoot, href)

  if (!container?.scrollTo || !container?.getBoundingClientRect || !targetElement?.getBoundingClientRect) {
    return
  }

  const containerRect = container.getBoundingClientRect()
  const targetRect = targetElement.getBoundingClientRect()
  const targetScrollTop = resolveMarkdownMenuTargetScrollTop({
    containerTop: containerRect.top,
    containerScrollTop: container.scrollTop,
    containerClientTop: container.clientTop,
    targetTop: targetRect.top,
  })

  setCurrentActiveHref(href)
  startProgrammaticScroll(container, targetScrollTop)
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
  stopProgrammaticScroll()
})
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden">
    <div class="flex items-center b-b-1 b-b-border-primary b-b-solid p-2 font-size-3.5 text-text-primary" :class="close ? 'justify-between' : 'justify-center'">
      <div class="select-none">
        {{ $t('outline') }}
      </div>
      <div v-if="close" class="i-tabler:x cursor-pointer" @click="close" />
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
          @click="event => onAnchorClick(event, item.href)"
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
