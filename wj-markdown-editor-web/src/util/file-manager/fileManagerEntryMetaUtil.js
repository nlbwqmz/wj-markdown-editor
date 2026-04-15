// 类型排序必须遵循产品定义顺序，不能退回到裸扩展名字典序。
const FILE_MANAGER_ENTRY_TYPE_ORDER = [
  'directory',
  'markdown',
  'image',
  'video',
  'pdf',
  'word',
  'sheet',
  'archive',
  'audio',
  'other',
]

const FILE_MANAGER_ENTRY_TYPE_WEIGHT_MAP = Object.freeze(FILE_MANAGER_ENTRY_TYPE_ORDER.reduce((weightMap, type, index) => {
  weightMap[type] = index
  return weightMap
}, {}))

const FILE_MANAGER_ENTRY_ICON_PROFILE_MAP = Object.freeze({
  directory: Object.freeze({
    iconClass: 'i-tabler:folder',
    testId: 'file-manager-entry-icon-directory',
  }),
  markdown: Object.freeze({
    iconClass: 'i-tabler:markdown',
    testId: 'file-manager-entry-icon-markdown',
  }),
  image: Object.freeze({
    iconClass: 'i-tabler:photo',
    testId: 'file-manager-entry-icon-image',
  }),
  video: Object.freeze({
    iconClass: 'i-tabler:movie',
    testId: 'file-manager-entry-icon-video',
  }),
  pdf: Object.freeze({
    iconClass: 'i-tabler:file-type-pdf',
    testId: 'file-manager-entry-icon-pdf',
  }),
  word: Object.freeze({
    iconClass: 'i-tabler:file-word',
    testId: 'file-manager-entry-icon-word',
  }),
  sheet: Object.freeze({
    iconClass: 'i-tabler:table',
    testId: 'file-manager-entry-icon-sheet',
  }),
  archive: Object.freeze({
    iconClass: 'i-tabler:zip',
    testId: 'file-manager-entry-icon-archive',
  }),
  audio: Object.freeze({
    iconClass: 'i-tabler:music',
    testId: 'file-manager-entry-icon-audio',
  }),
  other: Object.freeze({
    iconClass: 'i-tabler:file',
    testId: 'file-manager-entry-icon-other',
  }),
})

const IMAGE_EXTENSION_SET = new Set([
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
const VIDEO_EXTENSION_SET = new Set([
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
const PDF_EXTENSION_SET = new Set(['pdf'])
const WORD_EXTENSION_SET = new Set(['doc', 'docx', 'odt', 'rtf'])
const SHEET_EXTENSION_SET = new Set(['xls', 'xlsx', 'csv', 'ods'])
const ARCHIVE_EXTENSION_SET = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'])
const AUDIO_EXTENSION_SET = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'opus'])
const MARKDOWN_EXTENSION_SET = new Set(['md', 'markdown'])
const FILE_MANAGER_SORT_FIELD_SET = new Set(['name', 'modifiedTime', 'type'])
const FILE_MANAGER_SORT_DIRECTION_SET = new Set(['asc', 'desc'])
const DEFAULT_FILE_MANAGER_SORT_CONFIG = Object.freeze({
  field: 'type',
  direction: 'asc',
})

function resolveFileManagerEntryName(entry) {
  const normalizedName = typeof entry?.name === 'string'
    ? entry.name.trim()
    : ''

  if (normalizedName) {
    return normalizedName
  }

  const normalizedPath = typeof entry?.path === 'string'
    ? entry.path.trim()
    : ''
  const normalizedFileName = normalizedPath
    .split(/[\\/]/u)
    .pop()
    ?.split(/[?#]/u)[0]
    ?.trim()

  return normalizedFileName || ''
}

function normalizeFileManagerSortConfig(sortConfig) {
  const field = FILE_MANAGER_SORT_FIELD_SET.has(sortConfig?.field)
    ? sortConfig.field
    : DEFAULT_FILE_MANAGER_SORT_CONFIG.field
  const direction = FILE_MANAGER_SORT_DIRECTION_SET.has(sortConfig?.direction)
    ? sortConfig.direction
    : DEFAULT_FILE_MANAGER_SORT_CONFIG.direction

  return {
    field,
    direction,
  }
}

function compareFileManagerEntryName(left, right) {
  return resolveFileManagerEntryName(left).localeCompare(resolveFileManagerEntryName(right), 'zh-CN', {
    sensitivity: 'base',
    numeric: true,
  })
}

function resolveFileManagerEntryModifiedTimeMs(entry) {
  return Number.isFinite(entry?.modifiedTimeMs)
    ? entry.modifiedTimeMs
    : 0
}

function resolveExplicitFileManagerEntryType(entry) {
  if (entry?.kind === 'directory' || entry?.type === 'directory' || entry?.isDirectory === true) {
    return 'directory'
  }

  const explicitType = typeof entry?.kind === 'string' && FILE_MANAGER_ENTRY_TYPE_WEIGHT_MAP[entry.kind] !== undefined && entry.kind !== 'other'
    ? entry.kind
    : typeof entry?.type === 'string' && FILE_MANAGER_ENTRY_TYPE_WEIGHT_MAP[entry.type] !== undefined && entry.type !== 'other'
      ? entry.type
      : null

  return explicitType
}

export function resolveFileManagerEntryExtension(entry) {
  const normalizedName = resolveFileManagerEntryName(entry)
  const extensionIndex = normalizedName.lastIndexOf('.')

  if (extensionIndex <= 0 || extensionIndex === normalizedName.length - 1) {
    return ''
  }

  return normalizedName.slice(extensionIndex + 1).toLowerCase()
}

export function resolveFileManagerEntryType(entry) {
  const explicitType = resolveExplicitFileManagerEntryType(entry)
  if (explicitType) {
    return explicitType
  }

  const extension = resolveFileManagerEntryExtension(entry)
  if (MARKDOWN_EXTENSION_SET.has(extension)) {
    return 'markdown'
  }
  if (IMAGE_EXTENSION_SET.has(extension)) {
    return 'image'
  }
  if (VIDEO_EXTENSION_SET.has(extension)) {
    return 'video'
  }
  if (PDF_EXTENSION_SET.has(extension)) {
    return 'pdf'
  }
  if (WORD_EXTENSION_SET.has(extension)) {
    return 'word'
  }
  if (SHEET_EXTENSION_SET.has(extension)) {
    return 'sheet'
  }
  if (ARCHIVE_EXTENSION_SET.has(extension)) {
    return 'archive'
  }
  if (AUDIO_EXTENSION_SET.has(extension)) {
    return 'audio'
  }

  return 'other'
}

export function resolveFileManagerEntryTypeWeight(entryOrType) {
  const resolvedType = typeof entryOrType === 'string'
    ? entryOrType
    : resolveFileManagerEntryType(entryOrType)

  return FILE_MANAGER_ENTRY_TYPE_WEIGHT_MAP[resolvedType] ?? FILE_MANAGER_ENTRY_TYPE_WEIGHT_MAP.other
}

export function resolveFileManagerEntryIconProfile(entry) {
  return FILE_MANAGER_ENTRY_ICON_PROFILE_MAP[resolveFileManagerEntryType(entry)] || FILE_MANAGER_ENTRY_ICON_PROFILE_MAP.other
}

export function sortFileManagerEntryList(entryList, sortConfig) {
  const normalizedEntryList = Array.isArray(entryList)
    ? [...entryList]
    : []
  const normalizedSortConfig = normalizeFileManagerSortConfig(sortConfig)
  const directionFactor = normalizedSortConfig.direction === 'desc' ? -1 : 1

  return normalizedEntryList.sort((left, right) => {
    const leftType = resolveFileManagerEntryType(left)
    const rightType = resolveFileManagerEntryType(right)
    // 目录永远固定在前，其余条目再按配置字段参与排序。
    const directoryDiff = Number(leftType !== 'directory') - Number(rightType !== 'directory')

    if (directoryDiff !== 0) {
      return directoryDiff
    }

    if (normalizedSortConfig.field === 'name') {
      return compareFileManagerEntryName(left, right) * directionFactor
    }

    if (normalizedSortConfig.field === 'modifiedTime') {
      // 时间并列时回退到名称比较，避免渲染层出现不稳定抖动。
      const modifiedTimeDiff = resolveFileManagerEntryModifiedTimeMs(left) - resolveFileManagerEntryModifiedTimeMs(right)
      if (modifiedTimeDiff !== 0) {
        return modifiedTimeDiff * directionFactor
      }

      return compareFileManagerEntryName(left, right)
    }

    const typeWeightDiff = resolveFileManagerEntryTypeWeight(left) - resolveFileManagerEntryTypeWeight(right)
    if (typeWeightDiff !== 0) {
      return typeWeightDiff * directionFactor
    }

    return compareFileManagerEntryName(left, right)
  })
}

export default {
  resolveFileManagerEntryExtension,
  resolveFileManagerEntryType,
  resolveFileManagerEntryTypeWeight,
  resolveFileManagerEntryIconProfile,
  sortFileManagerEntryList,
}
