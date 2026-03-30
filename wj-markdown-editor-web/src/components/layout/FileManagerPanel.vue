<script setup>
import i18n from '@/i18n/index.js'
import { useCommonStore } from '@/stores/counter.js'
import { createFileManagerPanelController } from '@/util/file-manager/fileManagerPanelController.js'

const store = useCommonStore()
const { t } = i18n.global
const controller = createFileManagerPanelController({
  store,
  t,
})
const {
  breadcrumbList,
  emptyMessageKey,
  entryList,
  hasDirectory,
  openEntry,
  pickDirectory,
  requestCreateFolderFromInput,
  requestCreateMarkdownFromInput,
} = controller

function resolveEntryIconTestId(entry) {
  if (entry.kind === 'directory') {
    return 'file-manager-entry-icon-directory'
  }

  if (entry.kind === 'markdown') {
    return 'file-manager-entry-icon-markdown'
  }

  return 'file-manager-entry-icon-other'
}
</script>

<template>
  <div class="file-manager-panel h-full min-w-0 flex flex-col overflow-hidden bg-bg-primary text-text-primary">
    <div class="file-manager-panel__toolbar flex items-center gap-2 border-b border-b-border-primary border-b-solid px-3 py-2">
      <div
        data-testid="file-manager-breadcrumb"
        class="min-w-0 flex-1 truncate text-sm color-text-secondary"
      >
        <template v-if="breadcrumbList.length">
          <span
            v-for="(item, index) in breadcrumbList"
            :key="item.path"
            class="file-manager-panel__breadcrumb-item"
          >
            <span class="truncate">{{ item.label }}</span>
            <span v-if="index < breadcrumbList.length - 1" class="px-1">/</span>
          </span>
        </template>
        <span v-else-if="emptyMessageKey">{{ t(emptyMessageKey) }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          data-testid="file-manager-open-directory"
          class="file-manager-panel__action-btn"
          @click="pickDirectory"
        >
          <span class="i-tabler:folder-open" />
        </button>
        <button
          type="button"
          data-testid="file-manager-create-folder"
          class="file-manager-panel__action-btn"
          :disabled="!hasDirectory"
          @click="requestCreateFolderFromInput"
        >
          <span class="i-tabler:folder-plus" />
        </button>
        <button
          type="button"
          data-testid="file-manager-create-markdown"
          class="file-manager-panel__action-btn"
          :disabled="!hasDirectory"
          @click="requestCreateMarkdownFromInput"
        >
          <span class="i-tabler:file-plus" />
        </button>
      </div>
    </div>
    <div class="h-0 min-h-0 flex-1 overflow-hidden">
      <div
        v-if="!hasDirectory"
        data-testid="file-manager-empty-state"
        class="file-manager-panel__empty h-full flex flex-col items-center justify-center gap-3 px-4 text-center"
      >
        <div
          v-if="emptyMessageKey"
          class="file-manager-panel__empty-message max-w-full text-sm color-text-secondary"
        >
          {{ t(emptyMessageKey) }}
        </div>
        <button
          type="button"
          data-testid="file-manager-empty-open-directory"
          class="file-manager-panel__empty-btn"
          @click="pickDirectory"
        >
          {{ t('message.fileManagerSelectDirectory') }}
        </button>
      </div>
      <div
        v-else-if="entryList.length > 0"
        class="file-manager-panel__list h-full min-h-0 overflow-y-auto px-2 py-2"
      >
        <button
          v-for="entry in entryList"
          :key="entry.path"
          type="button"
          class="file-manager-panel__entry"
          :class="{ 'is-active': entry.isActive }"
          :data-testid="entry.isActive ? 'file-manager-entry-current' : null"
          @click="openEntry(entry)"
        >
          <span
            :data-testid="resolveEntryIconTestId(entry)"
            class="file-manager-panel__entry-icon"
            :class="entry.kind === 'directory'
              ? 'i-tabler:folder'
              : entry.kind === 'markdown'
                ? 'i-tabler:file-type-md'
                : 'i-tabler:file'"
          />
          <span
            data-testid="file-manager-entry-name"
            class="file-manager-panel__entry-name truncate"
          >
            {{ entry.name }}
          </span>
        </button>
      </div>
      <div
        v-else
        data-testid="file-manager-empty-state"
        class="file-manager-panel__empty h-full flex items-center justify-center px-4 text-center text-sm color-text-secondary"
      >
        {{ t(emptyMessageKey) }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.file-manager-panel__breadcrumb-item {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.file-manager-panel__action-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--wj-markdown-text-secondary);
  cursor: pointer;

  &:hover:enabled {
    background: var(--wj-markdown-bg-hover);
    color: var(--wj-markdown-text-primary);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.file-manager-panel__empty-btn {
  border: 1px solid var(--wj-markdown-border-primary);
  border-radius: 999px;
  padding: 6px 12px;
  background: var(--wj-markdown-bg-secondary);
  color: var(--wj-markdown-text-primary);
  cursor: pointer;

  &:hover {
    background: var(--wj-markdown-bg-hover);
  }
}

.file-manager-panel__entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 10px;
  background: transparent;
  padding: 8px 10px;
  text-align: left;
  color: inherit;
  cursor: pointer;

  &:hover {
    background: var(--wj-markdown-bg-hover);
  }

  &.is-active {
    background: var(--wj-markdown-bg-secondary);
    color: var(--wj-markdown-text-primary);
    box-shadow: inset 0 0 0 1px var(--wj-markdown-border-primary);
  }
}

.file-manager-panel__entry-icon {
  flex: 0 0 auto;
  font-size: 16px;
}

.file-manager-panel__entry-name {
  min-width: 0;
  flex: 1 1 auto;
}
</style>
