<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { getPreviewAssetPopupContainer } from '@/util/editor/previewAssetContextMenuUtil.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  x: {
    type: Number,
    default: 0,
  },
  y: {
    type: Number,
    default: 0,
  },
  items: {
    type: Array,
    default: () => [],
  },
})

const emits = defineEmits(['close', 'select'])

const EDGE_PADDING = 12
const MENU_WIDTH = 180
const MENU_HEIGHT = 112
const anchorClassName = 'preview-asset-context-anchor'
const dropdownClassName = 'preview-asset-context-dropdown'

function getViewportWidth() {
  return typeof window === 'undefined' ? 0 : window.innerWidth
}

function getViewportHeight() {
  return typeof window === 'undefined' ? 0 : window.innerHeight
}

function clampCoordinate(value, viewportSize) {
  const maxValue = Math.max(EDGE_PADDING, viewportSize - EDGE_PADDING)
  return Math.max(EDGE_PADDING, Math.min(value, maxValue))
}

function eventPathContainsClass(event, className) {
  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
  return eventPath.some(node => node instanceof HTMLElement && node.classList.contains(className))
}

const anchorStyle = computed(() => {
  return {
    left: `${clampCoordinate(props.x, getViewportWidth())}px`,
    top: `${clampCoordinate(props.y, getViewportHeight())}px`,
  }
})

const placement = computed(() => {
  const verticalPlacement = props.y > getViewportHeight() - MENU_HEIGHT ? 'top' : 'bottom'
  const horizontalPlacement = props.x > getViewportWidth() - MENU_WIDTH ? 'Right' : 'Left'
  return `${verticalPlacement}${horizontalPlacement}`
})

function closeMenu() {
  emits('close')
}

// 菜单壳只透传 actionKey，不承载具体业务语义。
function onMenuItemClick(actionKey) {
  emits('select', actionKey)
  closeMenu()
}

function onGlobalPointerDown(event) {
  if (!props.open) {
    return
  }
  if (eventPathContainsClass(event, dropdownClassName) || eventPathContainsClass(event, anchorClassName)) {
    return
  }
  closeMenu()
}

function onGlobalContextmenu(event) {
  if (!props.open) {
    return
  }
  if (eventPathContainsClass(event, dropdownClassName) || eventPathContainsClass(event, anchorClassName)) {
    return
  }
  closeMenu()
}

function onGlobalScroll() {
  if (props.open) {
    closeMenu()
  }
}

function onGlobalKeydown(event) {
  if (props.open && event.key === 'Escape') {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onGlobalPointerDown, true)
  document.addEventListener('contextmenu', onGlobalContextmenu, true)
  window.addEventListener('scroll', onGlobalScroll, true)
  window.addEventListener('resize', onGlobalScroll)
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onGlobalPointerDown, true)
  document.removeEventListener('contextmenu', onGlobalContextmenu, true)
  window.removeEventListener('scroll', onGlobalScroll, true)
  window.removeEventListener('resize', onGlobalScroll)
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <a-dropdown
    arrow
    :open="open"
    :trigger="[]"
    destroy-popup-on-hide
    :placement="placement"
    :overlay-style="{ minWidth: '168px' }"
    :get-popup-container="getPreviewAssetPopupContainer"
    :overlay-class-name="dropdownClassName"
    @open-change="(value) => { if (!value) closeMenu() }"
  >
    <div v-show="open" :class="anchorClassName" :style="anchorStyle" />
    <template #overlay>
      <a-menu>
        <!-- 危险项保留显式红色类，避免被项目级下拉菜单文字颜色覆盖。 -->
        <a-menu-item
          v-for="item in items"
          :key="item.key"
          :class="item.danger === true ? '!color-red' : undefined"
          :danger="item.danger === true"
          :data-menu-key="item.key"
          @click="onMenuItemClick(item.key)"
        >
          {{ item.label }}
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<style scoped lang="scss">
.preview-asset-context-anchor {
  position: fixed;
  z-index: 999;
  width: 1px;
  height: 1px;
  pointer-events: none;
}
</style>
