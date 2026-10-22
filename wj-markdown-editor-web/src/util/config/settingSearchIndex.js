import { normalizeSettingSearchText } from './settingSearchUtil.js'

/**
 * 设置页分组元数据。key 与模板中的 data-setting-section 一一对应，
 * tabKey 决定该项属于哪个左侧 tab 面板。
 */
const SETTING_SECTION_META = {
  general: { titleKey: 'config.title.general', tabKey: 'general' },
  fileManager: { titleKey: 'config.title.fileManager', tabKey: 'general' },
  view: { titleKey: 'config.title.view', tabKey: 'appearance' },
  font: { titleKey: 'config.title.fontFamily', tabKey: 'appearance' },
  editor: { titleKey: 'config.title.editor', tabKey: 'editor' },
  globalShortcut: { titleKey: 'config.title.globalShortcut', tabKey: 'shortcut' },
  editorShortcut: { titleKey: 'config.title.editorShortcut', tabKey: 'shortcut' },
  file: { titleKey: 'config.title.file', tabKey: 'fileAndImage' },
  image: { titleKey: 'config.title.picture', tabKey: 'fileAndImage' },
  imageBed: { titleKey: 'config.title.pictureBed', tabKey: 'fileAndImage' },
  export: { titleKey: 'config.title.export', tabKey: 'exportAndWatermark' },
  watermark: { titleKey: 'config.title.watermark', tabKey: 'exportAndWatermark' },
}

// tab 展示顺序，用于搜索结果稳定排序。
const SETTING_TAB_ORDER = {
  general: 0,
  appearance: 1,
  editor: 2,
  shortcut: 3,
  fileAndImage: 4,
  exportAndWatermark: 5,
}

/**
 * 设置项搜索索引。
 *
 * - id 必须与模板中的 isSettingItemVisible('<id>') / settingLabel('<id>') 完全一致。
 * - keywords 只写「label 猜不到」的同义词、别名与选项值，中英混写。
 * - optional 仅标记条件渲染项（当前配置下可能不显示），供测试与文档使用。
 */
const SETTING_SEARCH_ITEM_LIST = [
  // 常规
  { id: 'general.language', sectionId: 'general', labelKey: 'config.general.language', keywords: ['locale', '中文', '英文', 'english', 'zh', 'en'] },
  { id: 'general.startupView', sectionId: 'general', labelKey: 'config.general.startupView', keywords: ['源码', '双栏', '预览', 'source', 'split', 'preview'] },
  { id: 'general.restoreTabs', sectionId: 'general', labelKey: 'config.general.restoreTabs', keywords: ['tab', '标签', '恢复', 'restore', 'session', 'recent', '上次', '启动'] },
  { id: 'general.recentHistoryCount', sectionId: 'general', labelKey: 'config.general.recentHistoryCount', keywords: ['recent', 'max', '数量', '上限'] },
  { id: 'general.autoSave', sectionId: 'general', labelKey: 'config.general.autoSave', keywords: ['autosave', '失焦', '关闭窗口', '切换标签', 'blur', 'close', 'switch'] },
  { id: 'general.externalFileChangeStrategy', sectionId: 'general', labelKey: 'config.general.externalFileChangeStrategy', keywords: ['external', '冲突', '同步', '提醒', '直接应用', 'prompt', 'apply'] },

  // 侧边栏
  { id: 'fileManager.defaultView', sectionId: 'fileManager', labelKey: 'config.fileManager.defaultView', keywords: ['侧边栏', '文件', '大纲', 'sidebar', 'files', 'outline'] },
  { id: 'fileManager.defaultDirectory', sectionId: 'fileManager', labelKey: 'config.fileManager.defaultDirectory', keywords: ['directory', 'folder', '路径', 'path'] },
  { id: 'fileManager.markdownLeftClickAction', sectionId: 'fileManager', labelKey: 'config.fileManager.markdownLeftClickAction', keywords: ['click', '新窗口', '当前窗口', '提示', 'open'] },

  // 视图
  { id: 'view.editorPreviewPosition', sectionId: 'view', labelKey: 'config.view.editorPreviewPosition', keywords: ['preview', 'position', '左', '右', 'left', 'right'] },
  { id: 'view.globalTheme', sectionId: 'view', labelKey: 'config.view.globalTheme', keywords: ['theme', '暗黑', '深色', 'dark', '明亮', 'light', '夜间'] },
  { id: 'view.codeTheme', sectionId: 'view', labelKey: 'config.view.codeTheme', keywords: ['code', 'highlight', '高亮'] },
  { id: 'view.previewTheme', sectionId: 'view', labelKey: 'config.view.previewTheme', keywords: ['preview', 'theme'] },
  { id: 'view.previewImageShadow', sectionId: 'view', labelKey: 'config.view.previewImageShadow', keywords: ['image', 'shadow', '图片'] },
  { id: 'view.previewWidth', sectionId: 'view', labelKey: 'config.view.previewWidth', keywords: ['width', '宽度'] },
  { id: 'view.fontSize', sectionId: 'view', labelKey: 'config.view.fontSize', keywords: ['font', 'size', '字号'] },

  // 字体
  { id: 'font.editArea', sectionId: 'font', labelKey: 'config.fontFamily.editArea', keywords: ['font', '字体', 'edit'] },
  { id: 'font.previewArea', sectionId: 'font', labelKey: 'config.fontFamily.previewArea', keywords: ['font', '字体', 'preview'] },
  { id: 'font.codeArea', sectionId: 'font', labelKey: 'config.fontFamily.codeArea', keywords: ['font', '字体', 'code'] },
  { id: 'font.otherArea', sectionId: 'font', labelKey: 'config.fontFamily.otherArea', keywords: ['font', '字体', 'other'] },

  // 编辑器
  { id: 'editor.lineNumber', sectionId: 'editor', labelKey: 'config.editor.lineNumber', keywords: ['line', 'number', 'gutter'] },
  { id: 'editor.lineWrapping', sectionId: 'editor', labelKey: 'config.editor.lineWrapping', keywords: ['wrap', 'word wrap', '折行'] },
  { id: 'editor.highlightActiveLine', sectionId: 'editor', labelKey: 'config.editor.highlightActiveLine', keywords: ['active line', 'current line', '当前行'] },
  { id: 'editor.associationHighlight', sectionId: 'editor', labelKey: 'config.editor.associationHighlight', keywords: ['association', '关联'] },
  { id: 'editor.inlineCodeClickCopy', sectionId: 'editor', labelKey: 'config.editor.inlineCodeClickCopy', keywords: ['inline', 'code', '复制', 'copy'] },
  { id: 'editor.highlightMatchingText', sectionId: 'editor', labelKey: 'config.editor.highlightMatchingText', keywords: ['match', 'selection', '选中', '高亮'] },
  { id: 'editor.highlightMatchingBracket', sectionId: 'editor', labelKey: 'config.editor.highlightMatchingBracket', keywords: ['bracket', '括号', '匹配'] },
  { id: 'editor.autoCloseBracket', sectionId: 'editor', labelKey: 'config.editor.autoCloseBracket', keywords: ['bracket', '括号', '闭合', 'auto close'] },
  { id: 'editor.typographer', sectionId: 'editor', labelKey: 'config.editor.typographer', keywords: ['typographer', '标点', 'punctuation', '引号'] },

  // 文件
  { id: 'file.file', sectionId: 'file', labelKey: 'config.file.file', keywords: ['save', '保存', '路径'] },
  { id: 'file.absolutePath', sectionId: 'file', labelKey: 'config.file.absolutePath', keywords: ['absolute', '绝对'], optional: true },
  { id: 'file.relativePath', sectionId: 'file', labelKey: 'config.file.relativePath', keywords: ['relative', '相对'], optional: true },

  // 图片
  { id: 'image.localPicture', sectionId: 'image', labelKey: 'config.picture.localPicture', keywords: ['local', 'image', '图片', '保存'] },
  { id: 'image.networkPicture', sectionId: 'image', labelKey: 'config.picture.networkPicture', keywords: ['network', 'remote', '图片', '下载'] },
  { id: 'image.absolutePath', sectionId: 'image', labelKey: 'config.picture.absolutePath', keywords: ['absolute', '绝对'], optional: true },
  { id: 'image.relativePath', sectionId: 'image', labelKey: 'config.picture.relativePath', keywords: ['relative', '相对'], optional: true },

  // 图床
  { id: 'imageBed.pictureBed', sectionId: 'imageBed', labelKey: 'config.pictureBed.pictureBed', keywords: ['upload', '上传', '图床'] },
  { id: 'imageBed.smms.token', sectionId: 'imageBed', labelKey: 'config.pictureBed.token', keywords: ['token', '令牌', '密钥', 'smms', '图床'], optional: true },
  { id: 'imageBed.smms.customDomain', sectionId: 'imageBed', labelKey: 'config.pictureBed.customDomain', keywords: ['domain', 'cdn', '域名', 'smms'], optional: true },
  { id: 'imageBed.github.repo', sectionId: 'imageBed', labelKey: 'config.pictureBed.repository', keywords: ['repo', 'repository', 'github'], optional: true },
  { id: 'imageBed.github.token', sectionId: 'imageBed', labelKey: 'config.pictureBed.token', keywords: ['token', '令牌', '密钥', 'github', '图床'], optional: true },
  { id: 'imageBed.github.path', sectionId: 'imageBed', labelKey: 'config.pictureBed.storagePath', keywords: ['path', 'storage', '目录', 'github'], optional: true },
  { id: 'imageBed.github.branch', sectionId: 'imageBed', labelKey: 'config.pictureBed.branch', keywords: ['branch', 'github'], optional: true },
  { id: 'imageBed.github.customUrl', sectionId: 'imageBed', labelKey: 'config.pictureBed.customDomain', keywords: ['domain', 'cdn', '域名', 'github'], optional: true },

  // 导出
  { id: 'export.pdfPageNumber', sectionId: 'export', labelKey: 'config.export.pdfPageNumber', keywords: ['page', 'number', '页码'] },
  { id: 'export.pdfFooter', sectionId: 'export', labelKey: 'config.export.pdfFooter', keywords: ['footer', '页脚'] },
  { id: 'export.pdfHeader', sectionId: 'export', labelKey: 'config.export.pdfHeader', keywords: ['header', '页眉'] },

  // 水印
  { id: 'watermark.watermark', sectionId: 'watermark', labelKey: 'config.watermark.watermark', keywords: ['watermark', '开关', '启用'] },
  { id: 'watermark.previewWatermark', sectionId: 'watermark', labelKey: 'config.watermark.previewWatermark', keywords: ['preview', '预览'], optional: true },
  { id: 'watermark.watermarkTime', sectionId: 'watermark', labelKey: 'config.watermark.watermarkTime', keywords: ['date', 'time', '时间'], optional: true },
  { id: 'watermark.timeFormat', sectionId: 'watermark', labelKey: 'config.watermark.timeFormat', keywords: ['format', 'pattern', '格式'], optional: true },
  { id: 'watermark.content', sectionId: 'watermark', labelKey: 'config.watermark.content', keywords: ['content', 'text', '文字'], optional: true },
  { id: 'watermark.angle', sectionId: 'watermark', labelKey: 'config.watermark.angle', keywords: ['rotate', 'angle', '倾斜'], optional: true },
  { id: 'watermark.intervalWidth', sectionId: 'watermark', labelKey: 'config.watermark.intervalWidth', keywords: ['gap', '间距', 'width'], optional: true },
  { id: 'watermark.intervalHeight', sectionId: 'watermark', labelKey: 'config.watermark.intervalHeight', keywords: ['gap', '间距', 'height'], optional: true },
  { id: 'watermark.fontSize', sectionId: 'watermark', labelKey: 'config.watermark.fontSize', keywords: ['font', '字体', '字号'], optional: true },
  { id: 'watermark.fontWeight', sectionId: 'watermark', labelKey: 'config.watermark.fontWeight', keywords: ['font', '字体', '粗细'], optional: true },
  { id: 'watermark.fontColor', sectionId: 'watermark', labelKey: 'config.watermark.fontColor', keywords: ['font', '字体', '颜色', 'color'], optional: true },
]

/**
 * 快捷键项数量多且文案完全来自 shortcutKey.*，用生成器避免手写。
 *
 * @param {Array<{ id: string, keymap?: string, type?: string }>} shortcutKeyList
 * @returns {Array<object>} 原始索引项列表。
 */
function createShortcutSearchItemList(shortcutKeyList = []) {
  const sourceList = Array.isArray(shortcutKeyList) ? shortcutKeyList : []
  return sourceList
    .filter(item => item && typeof item.id === 'string' && item.id.length > 0)
    .map(item => ({
      id: `shortcut.${item.id}`,
      sectionId: item.type === 'editor' ? 'editorShortcut' : 'globalShortcut',
      labelKey: `shortcutKey.${item.id}`,
      keymap: typeof item.keymap === 'string' ? item.keymap : '',
    }))
}

/**
 * 把索引项解析为可匹配结构：注入双语文案并预计算归一化字段。
 * 归一化只在语言切换或快捷键配置变化时重算，搜索输入阶段直接复用。
 *
 * @param {object} options
 * @param {(key: string) => string} options.resolvePrimaryText 当前语言文案解析器。
 * @param {(key: string) => string} options.resolveAltText 另一语言文案解析器。
 * @param {Array<object>} [options.shortcutKeyList] 当前快捷键配置。
 * @returns {Array<object>} 解析后的索引项列表。
 */
function resolveSettingSearchItemList({
  resolvePrimaryText,
  resolveAltText,
  shortcutKeyList = [],
}) {
  const rawItemList = [...SETTING_SEARCH_ITEM_LIST, ...createShortcutSearchItemList(shortcutKeyList)]

  return rawItemList.map((item) => {
    const sectionMeta = SETTING_SECTION_META[item.sectionId] ?? {}
    const tabKey = sectionMeta.tabKey ?? ''
    const tabTitleKey = tabKey ? `config.title.${tabKey}` : ''
    const labelText = resolvePrimaryText(item.labelKey)
    const labelTextAlt = resolveAltText(item.labelKey)
    const sectionTitleText = sectionMeta.titleKey ? resolvePrimaryText(sectionMeta.titleKey) : ''
    const sectionTitleTextAlt = sectionMeta.titleKey ? resolveAltText(sectionMeta.titleKey) : ''
    const tabTitleText = tabTitleKey ? resolvePrimaryText(tabTitleKey) : ''
    const tabTitleTextAlt = tabTitleKey ? resolveAltText(tabTitleKey) : ''
    const keywordList = Array.isArray(item.keywords) ? item.keywords : []

    return {
      id: item.id,
      sectionId: item.sectionId,
      tabKey,
      tabOrder: SETTING_TAB_ORDER[tabKey] ?? Number.MAX_SAFE_INTEGER,
      labelKey: item.labelKey,
      labelText,
      labelTextAlt,
      keywordList,
      sectionTitleText,
      sectionTitleTextAlt,
      tabTitleText,
      tabTitleTextAlt,
      keymap: item.keymap ?? '',
      optional: item.optional === true,
      normalized: {
        label: normalizeSettingSearchText(labelText),
        labelAlt: normalizeSettingSearchText(labelTextAlt),
        labelNoSpace: normalizeSettingSearchText(labelText).replace(/\s+/g, ''),
        keywordList: keywordList.map(normalizeSettingSearchText).filter(Boolean),
        sectionTitleList: [sectionTitleText, sectionTitleTextAlt].map(normalizeSettingSearchText).filter(Boolean),
        tabTitleList: [tabTitleText, tabTitleTextAlt].map(normalizeSettingSearchText).filter(Boolean),
        keymap: normalizeSettingSearchText(item.keymap ?? '').replace(/\s+/g, ''),
      },
    }
  })
}

export {
  createShortcutSearchItemList,
  resolveSettingSearchItemList,
  SETTING_SEARCH_ITEM_LIST,
  SETTING_SECTION_META,
  SETTING_TAB_ORDER,
}
