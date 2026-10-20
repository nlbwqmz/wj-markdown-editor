<script setup>
import { Input as AInput } from 'ant-design-vue'
import { nextTick, onMounted, ref } from 'vue'

const props = defineProps({
  kind: {
    type: String,
    default: 'folder',
  },
})
const emit = defineEmits(['update:value'])

// Modal.confirm 的 content 只会创建一次，输入值必须由组件自身持有：
// 若只依赖创建 vnode 时传入的静态 value，输入框会一直停留在初始空串，
// 中文输入法在 compositionend 后回填的文本会被立即重置清空。
const value = ref('')
const inputRef = ref(null)

function handleUpdateValue(nextValue) {
  value.value = nextValue
  emit('update:value', nextValue)
}

// 用程序化聚焦替代 autofocus 属性：弹窗打开时页面已有焦点元素（菜单项、确定按钮等），
// 浏览器会拦截 autofocus 并输出控制台警告，输入框也拿不到焦点。
onMounted(async () => {
  await nextTick()
  inputRef.value?.focus()
})
</script>

<template>
  <AInput
    ref="inputRef"
    :value="value"
    @update:value="handleUpdateValue"
  >
    <template v-if="props.kind === 'markdown'" #addonAfter>
      <!-- 新建 Markdown 时固定展示 .md，用户只输入基础名称即可。 -->
      <span class="file-manager-entry-name-input__suffix">.md</span>
    </template>
  </AInput>
</template>

<style scoped lang="scss">
.file-manager-entry-name-input__suffix {
  color: var(--wj-markdown-text-primary);
}
</style>
