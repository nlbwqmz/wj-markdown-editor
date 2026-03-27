import Ajv from 'ajv'
import { configVersion } from './configConstants.js'

const fontFamilySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['editArea', 'previewArea', 'codeArea', 'otherArea'],
  properties: {
    editArea: { type: 'string' },
    previewArea: { type: 'string' },
    codeArea: { type: 'string' },
    otherArea: { type: 'string' },
  },
}

const markdownSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['typographer', 'inlineCodeClickCopy'],
  properties: {
    typographer: { type: 'boolean' },
    inlineCodeClickCopy: { type: 'boolean' },
  },
}

const exportSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pdf'],
  properties: {
    pdf: {
      type: 'object',
      additionalProperties: false,
      required: ['footer', 'header'],
      properties: {
        footer: {
          type: 'object',
          additionalProperties: false,
          required: ['pageNumber', 'content'],
          properties: {
            pageNumber: { type: 'boolean' },
            content: { type: 'string' },
          },
        },
        header: {
          type: 'object',
          additionalProperties: false,
          required: ['content'],
          properties: {
            content: { type: 'string' },
          },
        },
      },
    },
  },
}

const editorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['associationHighlight'],
  properties: {
    associationHighlight: { type: 'boolean' },
  },
}

const editorExtensionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'lineNumbers',
    'lineWrapping',
    'highlightActiveLine',
    'highlightSelectionMatches',
    'bracketMatching',
    'closeBrackets',
  ],
  properties: {
    lineNumbers: { type: 'boolean' },
    lineWrapping: { type: 'boolean' },
    highlightActiveLine: { type: 'boolean' },
    highlightSelectionMatches: { type: 'boolean' },
    bracketMatching: { type: 'boolean' },
    closeBrackets: { type: 'boolean' },
  },
}

const watermarkSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'enabled',
    'previewEnabled',
    'dateEnabled',
    'datePattern',
    'content',
    'rotate',
    'gap',
    'font',
  ],
  properties: {
    enabled: { type: 'boolean' },
    previewEnabled: { type: 'boolean' },
    dateEnabled: { type: 'boolean' },
    datePattern: { type: 'string' },
    content: { type: 'string' },
    rotate: { type: 'number' },
    gap: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'number' },
    },
    font: {
      type: 'object',
      additionalProperties: false,
      required: ['fontSize', 'fontWeight', 'color'],
      properties: {
        fontSize: { type: 'number' },
        fontWeight: { type: 'number' },
        color: { type: 'string' },
      },
    },
  },
}

const themeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['global', 'code', 'preview'],
  properties: {
    global: { enum: ['light', 'dark'] },
    code: { type: 'string' },
    preview: { type: 'string' },
  },
}

const shortcutKeySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['index', 'id', 'name', 'keymap', 'enabled', 'type'],
  properties: {
    index: { type: 'number' },
    id: { type: 'string' },
    name: { type: 'string' },
    keymap: { type: 'string' },
    enabled: { type: 'boolean' },
    type: { enum: ['web', 'editor'] },
  },
}

const imageBedSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['uploader', 'smms', 'github'],
  properties: {
    uploader: { enum: ['github', 'smms'] },
    smms: {
      type: 'object',
      additionalProperties: false,
      required: ['token', 'backupDomain'],
      properties: {
        token: { type: 'string' },
        backupDomain: { type: 'string' },
      },
    },
    github: {
      type: 'object',
      additionalProperties: false,
      required: ['repo', 'token', 'path', 'customUrl', 'branch'],
      properties: {
        repo: { type: 'string' },
        token: { type: 'string' },
        path: { type: 'string' },
        customUrl: { type: 'string' },
        branch: { type: 'string' },
      },
    },
  },
}

// 这里定义的是完整配置对象边界，不接受仅包含少量字段的 partial payload。
export const configSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'configVersion',
    'imgLocal',
    'imgNetwork',
    'imgAbsolutePath',
    'imgRelativePath',
    'fileMode',
    'fileAbsolutePath',
    'fileRelativePath',
    'autoSave',
    'menuVisible',
    'previewWidth',
    'fontSize',
    'fontFamily',
    'startPage',
    'openRecent',
    'recentMax',
    'language',
    'externalFileChangeStrategy',
    'markdown',
    'export',
    'editor',
    'editorExtension',
    'watermark',
    'theme',
    'shortcutKeyList',
    'imageBed',
  ],
  properties: {
    configVersion: { const: configVersion },
    imgLocal: { enum: ['1', '2', '3', '4', '5'] },
    imgNetwork: { enum: ['1', '2', '3', '4', '5'] },
    imgAbsolutePath: { type: 'string' },
    imgRelativePath: { type: 'string' },
    fileMode: { enum: ['2', '3', '4'] },
    fileAbsolutePath: { type: 'string' },
    fileRelativePath: { type: 'string' },
    autoSave: {
      type: 'array',
      items: { enum: ['blur', 'close'] },
    },
    menuVisible: { type: 'boolean' },
    previewWidth: { type: 'number' },
    fontSize: { type: 'number' },
    fontFamily: fontFamilySchema,
    startPage: { enum: ['editor', 'preview'] },
    openRecent: { type: 'boolean' },
    recentMax: { type: 'integer', minimum: 0, maximum: 50 },
    language: { enum: ['zh-CN', 'en-US'] },
    externalFileChangeStrategy: { enum: ['apply', 'prompt'] },
    markdown: markdownSchema,
    export: exportSchema,
    editor: editorSchema,
    editorExtension: editorExtensionSchema,
    watermark: watermarkSchema,
    theme: themeSchema,
    shortcutKeyList: {
      type: 'array',
      items: shortcutKeySchema,
    },
    imageBed: imageBedSchema,
  },
}

const ajv = new Ajv({ allErrors: true })
const validateConfig = ajv.compile(configSchema)

export function validateConfigShape(config) {
  const valid = validateConfig(config)

  if (!valid) {
    // 将 schema 错误整合为单条异常，便于调用方直接上抛。
    const message = ajv.errorsText(validateConfig.errors, { separator: '; ' })
    throw new Error(`配置结构不合法: ${message}`)
  }
}
