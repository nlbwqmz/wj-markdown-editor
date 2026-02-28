<script setup>
defineProps({
  formData: {
    type: Object,
    required: true,
  },
  formRules: {
    type: Object,
    required: true,
  },
})

const emits = defineEmits(['ok', 'update:name', 'update:url'])

const model = defineModel('open', {
  type: Boolean,
  default: false,
})
</script>

<template>
  <a-modal
    v-model:open="model"
    title="网络图片"
    ok-text="确定"
    cancel-text="取消"
    centered
    destroy-on-close
    @ok="emits('ok')"
  >
    <a-form
      :model="formData"
      :rules="formRules"
      autocomplete="off"
      :label-col="{ span: 4 }"
    >
      <a-form-item
        label="名称"
        name="name"
      >
        <a-input :value="formData.name" @update:value="(value) => emits('update:name', value)" />
      </a-form-item>
      <a-form-item
        label="链接"
        name="url"
      >
        <a-input :value="formData.url" @update:value="(value) => emits('update:url', value)" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>
