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

const menuItemElementMap = Object.create(null)
let currentContainer = null
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

const syncActiveHref = commonUtil.debounce(() => {
  const container = resolveMenuContainer()
  if (!container) {
    activeHref.value = ''
    return
  }

  const nextActiveHref = resolveMarkdownMenuActiveHref({
    headingRecords: getContainerHeadingRecords(container),
    scrollTop: container.scrollTop,
    clientHeight: container.clientHeight,
    scrollHeight: container.scrollHeight,
  })

  if (nextActiveHref === activeHref.value) {
    return
  }

  activeHref.value = nextActiveHref
  if (!nextActiveHref) {
    return
  }

  nextTick(() => {
    menuItemElementMap[nextActiveHref]?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
  })
}, 60)

function bindContainer() {
  currentContainer?.removeEventListener?.('scroll', syncActiveHref)
  currentContainer = resolveMenuContainer()
  currentContainer?.addEventListener?.('scroll', syncActiveHref)
  syncActiveHref()
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

  container.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth',
  })
}

watch(() => props.anchorList, () => {
  nextTick(() => {
    bindContainer()
  })
}, { deep: true, immediate: true })

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
          class="markdown-menu__item"
          :class="{ 'markdown-menu__item--active': isActiveHref(item.href), 'markdown-menu__item--level-1': item.level === 1 }"
          :style="{ '--wj-markdown-menu-depth': item.depth }"
          data-testid="markdown-menu-item"
          :data-href="item.href"
          :data-depth="String(item.depth)"
          :data-active="String(isActiveHref(item.href))"
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
  text-align: left;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--wj-markdown-bg-hover);
    color: var(--wj-markdown-text-primary);
  }
}

.markdown-menu__item--level-1 {
  color: var(--wj-markdown-text-primary);
  font-weight: 600;
}

.markdown-menu__item--active {
  background: var(--wj-markdown-bg-secondary);
  color: var(--wj-markdown-text-primary);
  font-weight: 600;

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
