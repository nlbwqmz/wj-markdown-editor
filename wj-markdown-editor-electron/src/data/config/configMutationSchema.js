// 数组型配置仅开放固定下标，避免泛化成任意数组元素写入。
const FIXED_INDEX_PATH_SET = new Set([
  'watermark.gap.0',
  'watermark.gap.1',
])

// 普通 set 操作只允许写入明确列出的叶子配置项。
const SET_PATH_SET = new Set([
  'language',
  'theme.global',
  'theme.code',
  'theme.preview',
  'fileManagerSort.field',
  'fileManagerSort.direction',
  'fontSize',
  'previewWidth',
  'menuVisible',
  'fileManagerVisible',
  'editor.previewPosition',
  'fileManagerLeftClickAction.markdown',
  'editor.associationHighlight',
  'editorExtension.lineNumbers',
  'editorExtension.lineWrapping',
  'editorExtension.highlightActiveLine',
  'editorExtension.highlightSelectionMatches',
  'editorExtension.bracketMatching',
  'editorExtension.closeBrackets',
  'markdown.typographer',
  'markdown.inlineCodeClickCopy',
  'externalFileChangeStrategy',
  'startPage',
  'openRecent',
  'recentMax',
  'imgLocal',
  'imgNetwork',
  'imgAbsolutePath',
  'imgRelativePath',
  'fileMode',
  'fileAbsolutePath',
  'fileRelativePath',
  'imageBed.uploader',
  'imageBed.smms.token',
  'imageBed.smms.backupDomain',
  'imageBed.github.repo',
  'imageBed.github.token',
  'imageBed.github.path',
  'imageBed.github.branch',
  'imageBed.github.customUrl',
  'fontFamily.editArea',
  'fontFamily.previewArea',
  'fontFamily.codeArea',
  'fontFamily.otherArea',
  'watermark.enabled',
  'watermark.previewEnabled',
  'watermark.dateEnabled',
  'watermark.datePattern',
  'watermark.content',
  'watermark.rotate',
  'watermark.font.fontSize',
  'watermark.font.fontWeight',
  'watermark.font.color',
  'export.pdf.footer.pageNumber',
  'export.pdf.footer.content',
  'export.pdf.header.content',
])

const OPERATION_TYPE_SET = new Set([
  'set',
  'setShortcutKeyField',
  'setAutoSaveOption',
  'reset',
])

const SHORTCUT_KEY_FIELD_SET = new Set(['keymap', 'enabled'])
const AUTO_SAVE_OPTION_SET = new Set(['blur', 'close'])

function createPathKey(path) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new TypeError('配置更新路径必须是非空数组')
  }

  return path.map(item => String(item)).join('.')
}

function validateSetOperation(operation) {
  const pathKey = createPathKey(operation.path)

  if (String(operation.path[0]) === 'shortcutKeyList') {
    throw new TypeError('shortcutKeyList 仅允许按 id 更新')
  }

  if (!SET_PATH_SET.has(pathKey) && !FIXED_INDEX_PATH_SET.has(pathKey)) {
    throw new TypeError(`未知配置更新路径: ${pathKey}`)
  }
}

function validateShortcutKeyOperation(operation) {
  if (typeof operation.id !== 'string' || operation.id.length === 0) {
    throw new TypeError('快捷键 id 必须是非空字符串')
  }

  if (!SHORTCUT_KEY_FIELD_SET.has(operation.field)) {
    throw new TypeError('快捷键字段仅允许 keymap / enabled')
  }
}

function validateAutoSaveOperation(operation) {
  if (!AUTO_SAVE_OPTION_SET.has(operation.option)) {
    throw new TypeError('自动保存选项仅允许 blur / close')
  }

  if (typeof operation.enabled !== 'boolean') {
    throw new TypeError('自动保存启用状态必须是布尔值')
  }
}

export function validateConfigMutationRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('配置更新请求必须是对象')
  }

  if (!Array.isArray(request.operations) || request.operations.length === 0) {
    throw new TypeError('配置更新请求必须包含非空 operations')
  }

  const resetCount = request.operations.filter(operation => operation?.type === 'reset').length

  if (resetCount > 0 && request.operations.length > 1) {
    throw new TypeError('reset 操作必须单独提交')
  }

  for (const operation of request.operations) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
      throw new TypeError('配置更新操作必须是对象')
    }

    if (!OPERATION_TYPE_SET.has(operation.type)) {
      throw new TypeError(`未知配置更新操作类型: ${operation.type}`)
    }

    if (operation.type === 'set') {
      validateSetOperation(operation)
      continue
    }

    if (operation.type === 'setShortcutKeyField') {
      validateShortcutKeyOperation(operation)
      continue
    }

    if (operation.type === 'setAutoSaveOption') {
      validateAutoSaveOperation(operation)
    }
  }
}
