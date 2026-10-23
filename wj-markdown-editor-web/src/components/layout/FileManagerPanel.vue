<script setup>
import { Dropdown as ADropdown, Empty as AEmpty, Input as AInput, Menu as AMenu } from 'ant-design-vue'
import { computed, h, nextTick, ref } from 'vue'
import IconButton from '@/components/editor/IconButton.vue'
import i18n from '@/i18n/index.js'
import { useCommonStore } from '@/stores/counter.js'
import { resolveFileManagerEntryIconProfile } from '@/util/file-manager/fileManagerEntryMetaUtil.js'
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
  canFocusCurrentDocumentDirectory,
  emptyMessageKey,
  focusCurrentDocumentDirectory,
  hasDirectory,
  openEntry,
  openParentDirectory,
  pickDirectory,
  requestCreateFolderFromInput,
  requestCreateMarkdownFromInput,
  updateFileManagerSortConfig,
  updateFileManagerVisibleFileMode,
  visibleEntryList,
  visibleFileMode,
} = controller

const searchQuery = ref('')
const panelRootRef = ref(null)
const SCROLL_INTO_VIEW_OPTIONS = Object.freeze({
  behavior: 'smooth',
  block: 'center',
  inline: 'nearest',
})

const filteredEntryList = computed(() => {
  if (!searchQuery.value.trim()) {
    return visibleEntryList.value
  }
  const query = searchQuery.value.toLowerCase()
  return visibleEntryList.value.filter(entry =>
    entry.name.toLowerCase().includes(query),
  )
})

// 显示范围为「仅可打开的文件」时，搜索框文案同步提示过滤范围。
const searchPlaceholder = computed(() => visibleFileMode.value === 'supported'
  ? t('message.fileManagerSearchPlaceholderSupported')
  : t('message.fileManagerSearchPlaceholder'))

const createMenuList = computed(() => [
  {
    key: 'create-folder',
    label: t('message.fileManagerCreateFolder'),
    action: requestCreateFolderFromInput,
  },
  {
    key: 'create-markdown',
    label: t('message.fileManagerCreateMarkdown'),
    action: requestCreateMarkdownFromInput,
  },
])

const sortMenuCurrentKey = computed(() => {
  const field = ['name', 'modifiedTime', 'type'].includes(store?.config?.fileManagerSort?.field)
    ? store.config.fileManagerSort.field
    : 'type'
  const direction = ['asc', 'desc'].includes(store?.config?.fileManagerSort?.direction)
    ? store.config.fileManagerSort.direction
    : 'asc'

  return `${field}-${direction}`
})

function createSortMenuLabel(messageKey, key) {
  const label = t(messageKey)
  const indicatorClass = sortMenuCurrentKey.value === key ? 'i-tabler:check mr-1' : 'mr-1 inline-block w-[1em]'

  return h('span', { class: 'inline-flex items-center' }, [
    h('span', { class: indicatorClass }),
    label,
  ])
}

const sortMenuList = computed(() => [
  {
    key: 'type-asc',
    label: createSortMenuLabel('message.fileManagerSortTypeAsc', 'type-asc'),
    action: () => updateFileManagerSortConfig({
      field: 'type',
      direction: 'asc',
    }),
  },
  {
    key: 'type-desc',
    label: createSortMenuLabel('message.fileManagerSortTypeDesc', 'type-desc'),
    action: () => updateFileManagerSortConfig({
      field: 'type',
      direction: 'desc',
    }),
  },
  {
    key: 'name-asc',
    label: createSortMenuLabel('message.fileManagerSortNameAsc', 'name-asc'),
    action: () => updateFileManagerSortConfig({
      field: 'name',
      direction: 'asc',
    }),
  },
  {
    key: 'name-desc',
    label: createSortMenuLabel('message.fileManagerSortNameDesc', 'name-desc'),
    action: () => updateFileManagerSortConfig({
      field: 'name',
      direction: 'desc',
    }),
  },
  {
    key: 'modifiedTime-asc',
    label: createSortMenuLabel('message.fileManagerSortModifiedTimeAsc', 'modifiedTime-asc'),
    action: () => updateFileManagerSortConfig({
      field: 'modifiedTime',
      direction: 'asc',
    }),
  },
  {
    key: 'modifiedTime-desc',
    label: createSortMenuLabel('message.fileManagerSortModifiedTimeDesc', 'modifiedTime-desc'),
    action: () => updateFileManagerSortConfig({
      field: 'modifiedTime',
      direction: 'desc',
    }),
  },
])

function createVisibleFileModeMenuLabel(messageKey, key) {
  const label = t(messageKey)
  const indicatorClass = visibleFileMode.value === key ? 'i-tabler:check mr-1' : 'mr-1 inline-block w-[1em]'

  return h('span', { class: 'inline-flex items-center' }, [
    h('span', { class: indicatorClass }),
    label,
  ])
}

const visibleFileModeMenuList = computed(() => [
  {
    key: 'all',
    label: createVisibleFileModeMenuLabel('message.fileManagerVisibleFileModeAll', 'all'),
    action: () => updateFileManagerVisibleFileMode('all'),
  },
  {
    key: 'supported',
    label: createVisibleFileModeMenuLabel('message.fileManagerVisibleFileModeSupported', 'supported'),
    action: () => updateFileManagerVisibleFileMode('supported'),
  },
])

function resolveEntryIconTestId(entry) {
  return resolveFileManagerEntryIconProfile(entry).testId
}

function resolveEntryIconClass(entry) {
  return resolveFileManagerEntryIconProfile(entry).iconClass
}

function createMarkdownEntryMenuList(entry) {
  if (entry?.kind !== 'markdown') {
    return []
  }

  return [
    {
      key: 'current-window',
      label: t('message.fileManagerOpenInCurrentWindow'),
      action: () => openEntry(entry, { openMode: 'current-window' }),
    },
    {
      key: 'new-window',
      label: t('message.fileManagerOpenInNewWindow'),
      action: () => openEntry(entry, { openMode: 'new-window' }),
    },
  ]
}

function handleMarkdownEntryMenuClick(entry, menuInfo) {
  const matchedMenu = createMarkdownEntryMenuList(entry)
    .find(item => String(item.key) === String(menuInfo?.key))

  matchedMenu?.action?.()
}

// 公共 IconButton 不处理禁用态时，在当前面板内补充交互限制和视觉弱化。
const disabledToolbarButtonClass = 'pointer-events-none cursor-not-allowed opacity-45'
const resolvedDirectoryPath = computed(() => breadcrumbList.value.length
  ? breadcrumbList.value[breadcrumbList.value.length - 1].path
  : '')

function resolveCurrentEntryElement() {
  return panelRootRef.value?.querySelector('[data-testid="file-manager-entry-current"]') ?? null
}

// 定位按钮的最终交互在组件层完成：目录切换结束后，再按当前渲染结果决定是否清空搜索并滚动。
async function scrollCurrentEntryIntoView() {
  await nextTick()

  let currentEntryElement = resolveCurrentEntryElement()
  if (!currentEntryElement && searchQuery.value.trim()) {
    searchQuery.value = ''
    await nextTick()
    currentEntryElement = resolveCurrentEntryElement()
  }

  currentEntryElement?.scrollIntoView(SCROLL_INTO_VIEW_OPTIONS)
  return currentEntryElement
}

async function handleFocusCurrentDocumentDirectory() {
  const result = await focusCurrentDocumentDirectory()
  if (result?.ok === false) {
    return result
  }

  await scrollCurrentEntryIntoView()
  return result
}
</script>

<template>
  <div ref="panelRootRef" class="file-manager-panel h-full min-w-0 flex flex-col overflow-hidden bg-bg-primary text-text-primary">
    <div class="file-manager-panel__toolbar flex items-center gap-2 border-b border-b-border-primary border-b-solid p-1">
      <div
        data-testid="file-manager-breadcrumb"
        :title="resolvedDirectoryPath || undefined"
        class="file-manager-panel__path min-w-0 flex-1 text-sm color-text-secondary"
      >
        <span v-if="resolvedDirectoryPath" class="file-manager-panel__path-text">
          <span class="file-manager-panel__path-value">{{ resolvedDirectoryPath }}</span>
        </span>
        <span v-else-if="emptyMessageKey" class="block w-full overflow-hidden text-ellipsis whitespace-nowrap">
          <span>{{ t(emptyMessageKey) }}</span>
        </span>
      </div>
      <div class="flex items-center gap-1">
        <IconButton
          data-testid="file-manager-open-parent"
          icon="i-tabler:arrow-up"
          :label="t('message.fileManagerOpenParentDirectory')"
          :action="canOpenParentDirectory ? openParentDirectory : undefined"
          :disabled="!canOpenParentDirectory ? true : undefined"
          :class="!canOpenParentDirectory ? disabledToolbarButtonClass : undefined"
        />
        <IconButton
          data-testid="file-manager-focus-current-file-directory"
          icon="i-tabler:focus-2"
          :label="t('message.fileManagerFocusCurrentFileDirectory')"
          :action="canFocusCurrentDocumentDirectory ? handleFocusCurrentDocumentDirectory : undefined"
          :disabled="!canFocusCurrentDocumentDirectory ? true : undefined"
          :class="!canFocusCurrentDocumentDirectory ? disabledToolbarButtonClass : undefined"
        />
        <IconButton
          data-testid="file-manager-open-directory"
          icon="i-tabler:folder-open"
          :label="t('message.fileManagerSelectDirectory')"
          :action="pickDirectory"
        />
        <IconButton
          data-testid="file-manager-create-entry"
          icon="i-tabler:square-plus"
          :label="t('message.fileManagerCreateEntry')"
          :menu-list="hasDirectory ? createMenuList : []"
          :menu-trigger="['click']"
          :disabled="!hasDirectory ? true : undefined"
          :class="!hasDirectory ? disabledToolbarButtonClass : undefined"
        />
        <IconButton
          data-testid="file-manager-sort-entry"
          icon="i-tabler:arrows-sort"
          :label="t('message.fileManagerSort')"
          :menu-list="sortMenuList"
          :menu-trigger="['hover']"
          :show-tooltip="false"
        />
      </div>
    </div>
    <div v-if="hasDirectory" class="file-manager-panel__search flex items-center gap-1 border-b border-b-border-primary border-b-solid p-1">
      <AInput
        v-model:value="searchQuery"
        allow-clear
        :placeholder="searchPlaceholder"
        class="file-manager-panel__search-input min-w-0 flex-1"
        size="small"
      />
      <IconButton
        data-testid="file-manager-visible-file-mode"
        icon="i-tabler:filter"
        :label="t('message.fileManagerVisibleFileMode')"
        :menu-list="visibleFileModeMenuList"
        :menu-trigger="['hover']"
        :show-tooltip="false"
      />
    </div>
    <div class="h-0 min-h-0 flex-1 overflow-hidden">
      <div
        v-if="!hasDirectory"
        data-testid="file-manager-empty-state"
        class="file-manager-panel__empty h-full flex items-center justify-center px-4"
      >
        <AEmpty :description="null" />
      </div>
      <div
        v-else-if="filteredEntryList.length > 0"
        class="wj-scrollbar file-manager-panel__list h-full min-h-0 overflow-y-auto p-1"
      >
        <template v-for="entry in filteredEntryList" :key="entry.path">
          <ADropdown
            v-if="entry.kind === 'markdown'"
            :trigger="['contextmenu']"
            placement="bottomLeft"
          >
            <button
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
            <template #overlay>
              <AMenu
                mode="vertical"
                :items="createMarkdownEntryMenuList(entry)"
                @click="menuInfo => handleMarkdownEntryMenuClick(entry, menuInfo)"
              />
            </template>
          </ADropdown>
          <button
            v-else
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
        </template>
      </div>
      <div
        v-else
        data-testid="file-manager-empty-state"
        class="file-manager-panel__empty h-full flex items-center justify-center p-1"
      >
        <AEmpty>
          <template #description>
            <span class="file-manager-panel__empty-description color-gray-500">
              {{ searchQuery ? t('message.fileManagerNoSearchResults') : t(emptyMessageKey) }}
            </span>
          </template>
        </AEmpty>
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
  line-height: 1.5;
  direction: rtl;
  text-align: left;
}

.file-manager-panel__path-value {
  direction: ltr;
  unicode-bidi: bidi-override;
}

.file-manager-panel__entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  padding: 4px 8px;
  text-align: left;
  color: inherit;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--wj-markdown-bg-secondary);
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
  font-size: 15px;
  line-height: 1;
}

.file-manager-panel__entry-name {
  min-width: 0;
  flex: 1 1 auto;
  line-height: 20px;
}
</style>
