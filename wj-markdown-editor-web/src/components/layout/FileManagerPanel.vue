<script setup>
import { computed } from 'vue'
import IconButton from '@/components/editor/IconButton.vue'
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
  canOpenParentDirectory,
  createFolder,
  createMarkdown,
  emptyMessageKey,
  entryList,
  hasDirectory,
  openEntry,
  openParentDirectory,
  pickDirectory,
} = controller

const imageExtensionSet = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'webp',
  'svg',
  'ico',
  'avif',
  'tif',
  'tiff',
  'heic',
  'heif',
])
const videoExtensionSet = new Set([
  'mp4',
  'mov',
  'm4v',
  'avi',
  'mkv',
  'webm',
  'wmv',
  'flv',
  'mpeg',
  'mpg',
])
const pdfExtensionSet = new Set(['pdf'])
const wordExtensionSet = new Set(['doc', 'docx', 'odt', 'rtf'])
const sheetExtensionSet = new Set(['xls', 'xlsx', 'csv', 'ods'])
const archiveExtensionSet = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'])
const audioExtensionSet = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'opus'])

const entryIconProfileMap = {
  directory: {
    iconClass: 'i-tabler:folder',
    testId: 'file-manager-entry-icon-directory',
  },
  markdown: {
    iconClass: 'i-tabler:markdown',
    testId: 'file-manager-entry-icon-markdown',
  },
  image: {
    iconClass: 'i-tabler:photo',
    testId: 'file-manager-entry-icon-image',
  },
  video: {
    iconClass: 'i-tabler:movie',
    testId: 'file-manager-entry-icon-video',
  },
  pdf: {
    iconClass: 'i-tabler:file-type-pdf',
    testId: 'file-manager-entry-icon-pdf',
  },
  word: {
    iconClass: 'i-tabler:file-word',
    testId: 'file-manager-entry-icon-word',
  },
  sheet: {
    iconClass: 'i-tabler:table',
    testId: 'file-manager-entry-icon-sheet',
  },
  archive: {
    iconClass: 'i-tabler:zip',
    testId: 'file-manager-entry-icon-archive',
  },
  audio: {
    iconClass: 'i-tabler:music',
    testId: 'file-manager-entry-icon-audio',
  },
  other: {
    iconClass: 'i-tabler:file',
    testId: 'file-manager-entry-icon-other',
  },
}

function resolveEntryFileExtension(entry) {
  const targetName = typeof entry?.name === 'string' && entry.name.trim()
    ? entry.name
    : entry?.path || ''
  const normalizedName = String(targetName)
    .trim()
    .split(/[\\/]/u)
    .pop()
    ?.split(/[?#]/u)[0] || ''
  const extensionIndex = normalizedName.lastIndexOf('.')

  if (extensionIndex <= 0 || extensionIndex === normalizedName.length - 1) {
    return ''
  }

  return normalizedName.slice(extensionIndex + 1).toLowerCase()
}

function resolveEntryIconProfile(entry) {
  if (entry?.kind === 'directory') {
    return entryIconProfileMap.directory
  }

  const extension = resolveEntryFileExtension(entry)
  if (entry?.kind === 'markdown' || extension === 'md' || extension === 'markdown') {
    return entryIconProfileMap.markdown
  }
  if (imageExtensionSet.has(extension)) {
    return entryIconProfileMap.image
  }
  if (videoExtensionSet.has(extension)) {
    return entryIconProfileMap.video
  }
  if (pdfExtensionSet.has(extension)) {
    return entryIconProfileMap.pdf
  }
  if (wordExtensionSet.has(extension)) {
    return entryIconProfileMap.word
  }
  if (sheetExtensionSet.has(extension)) {
    return entryIconProfileMap.sheet
  }
  if (archiveExtensionSet.has(extension)) {
    return entryIconProfileMap.archive
  }
  if (audioExtensionSet.has(extension)) {
    return entryIconProfileMap.audio
  }

  return entryIconProfileMap.other
}

function resolveEntryIconTestId(entry) {
  return resolveEntryIconProfile(entry).testId
}

function resolveEntryIconClass(entry) {
  return resolveEntryIconProfile(entry).iconClass
}

// 公共 IconButton 不处理禁用态时，在当前面板内补充交互限制和视觉弱化。
const disabledToolbarButtonClass = 'pointer-events-none cursor-not-allowed opacity-45'
const resolvedDirectoryPath = computed(() => breadcrumbList.value.length
  ? breadcrumbList.value[breadcrumbList.value.length - 1].path
  : '')
</script>

<template>
  <div class="file-manager-panel h-full min-w-0 flex flex-col overflow-hidden bg-bg-primary text-text-primary">
    <div class="file-manager-panel__toolbar flex items-center gap-2 border-b border-b-border-primary border-b-solid p-1">
      <div
        data-testid="file-manager-breadcrumb"
        :title="resolvedDirectoryPath || undefined"
        class="file-manager-panel__path min-w-0 flex-1 text-sm color-text-secondary"
      >
        <span v-if="resolvedDirectoryPath" class="file-manager-panel__path-text">
          <span class="file-manager-panel__path-value">{{ resolvedDirectoryPath }}</span>
        </span>
        <span v-else-if="emptyMessageKey">{{ t(emptyMessageKey) }}</span>
      </div>
      <div class="flex items-center gap-1">
        <IconButton
          data-testid="file-manager-open-parent"
          icon="i-tabler:arrow-up"
          :label="t('message.fileManagerOpenParentDirectory')"
          :title="t('message.fileManagerOpenParentDirectory')"
          :action="canOpenParentDirectory ? openParentDirectory : undefined"
          :disabled="!canOpenParentDirectory ? true : undefined"
          :class="!canOpenParentDirectory ? disabledToolbarButtonClass : undefined"
        />
        <IconButton
          data-testid="file-manager-open-directory"
          icon="i-tabler:folder-open"
          :label="t('message.fileManagerSelectDirectory')"
          :title="t('message.fileManagerSelectDirectory')"
          :action="pickDirectory"
        />
        <IconButton
          data-testid="file-manager-create-folder"
          icon="i-tabler:folder-plus"
          :label="t('message.fileManagerCreateFolder')"
          :title="t('message.fileManagerCreateFolder')"
          :action="hasDirectory ? createFolder : undefined"
          :disabled="!hasDirectory ? true : undefined"
          :class="!hasDirectory ? disabledToolbarButtonClass : undefined"
        />
        <IconButton
          data-testid="file-manager-create-markdown"
          icon="i-tabler:file-plus"
          :label="t('message.fileManagerCreateMarkdown')"
          :title="t('message.fileManagerCreateMarkdown')"
          :action="hasDirectory ? createMarkdown : undefined"
          :disabled="!hasDirectory ? true : undefined"
          :class="!hasDirectory ? disabledToolbarButtonClass : undefined"
        />
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
        class="wj-scrollbar file-manager-panel__list h-full min-h-0 overflow-y-auto px-2 py-2"
      >
        <button
          v-for="entry in entryList"
          :key="entry.path"
          :title="entry.name"
          type="button"
          class="file-manager-panel__entry"
          :class="{ 'is-active': entry.isActive }"
          :data-testid="entry.isActive ? 'file-manager-entry-current' : null"
          @click="openEntry(entry)"
        >
          <span
            :data-testid="resolveEntryIconTestId(entry)"
            class="file-manager-panel__entry-icon"
            :class="resolveEntryIconClass(entry)"
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
.file-manager-panel__path-text {
  display: block;
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
}

.file-manager-panel__path-value {
  direction: ltr;
  unicode-bidi: bidi-override;
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
    color: var(--wj-markdown-text-primary);
  }

  // 当前文件继续仅用文字高亮，但切到项目内统一使用的蓝色主视觉。
  &.is-active {
    color: #1677ff;
    font-weight: 600;
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
