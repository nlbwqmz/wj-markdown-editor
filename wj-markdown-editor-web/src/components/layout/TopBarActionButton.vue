<script setup>
import { computed } from 'vue'

/**
 * 顶部栏图标动作按钮。
 *
 * 主窗口工具栏、次级窗口标题栏（设置 / 示例 / 关于）共用同一套视觉：
 * 外层 32×32 作为点击区域，内层 28×28 圆角块只负责背景反馈。
 * 结构必须保持两层，否则背景会铺满整个点击区、看起来比工具栏其他按钮“胖”一圈。
 */
const props = defineProps({
  icon: {
    type: String,
    required: true,
  },
  // 关闭类动作用红色 hover
  danger: {
    type: Boolean,
    default: false,
  },
  // 选中态：背景常驻 bg-hover，非选中时 hover 用更弱的 bg-secondary
  active: {
    type: Boolean,
    default: false,
  },
})

const surfaceClass = computed(() => {
  if (props.danger) {
    return 'group-hover:bg-red'
  }
  if (props.active) {
    return 'bg-bg-hover'
  }
  return 'group-hover:bg-[var(--wj-markdown-bg-secondary)]'
})
</script>

<template>
  <div class="group h-8 w-8 flex items-center justify-center hover:cursor-pointer">
    <div
      class="h-7 w-7 flex items-center justify-center rounded-1"
      :class="surfaceClass"
    >
      <!-- danger（关闭）hover 时背景转红，图标同步转黑保证对比度 -->
      <div
        class="transition-colors duration-150"
        :class="[props.icon, props.danger ? 'group-hover:text-black' : '']"
      />
    </div>
  </div>
</template>
