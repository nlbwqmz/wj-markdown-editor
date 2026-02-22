import constant from '@/util/constant.js'

const codeThemeList = constant.codeThemeList

// 当前主题 style 标签 ID
const THEME_STYLE_ID = 'dynamic-code-theme'

// 当前应用的主题名称
let currentTheme = ''

// 主题 CSS 缓存
const themeCssCache = new Map()

// 主题加载器缓存
let themeLoaders = null

/**
 * 验证主题名称是否有效
 * @param {string} themeName - 主题名称
 * @returns {boolean}
 */
function isValidTheme(themeName) {
  return codeThemeList.includes(themeName)
}

/**
 * 应用主题 CSS 到 style 标签
 * @param {string} cssContent - CSS 内容
 */
function applyThemeStyle(cssContent) {
  let styleTag = document.getElementById(THEME_STYLE_ID)
  if (!styleTag) {
    styleTag = document.createElement('style')
    styleTag.id = THEME_STYLE_ID
    document.head.appendChild(styleTag)
  }
  styleTag.textContent = cssContent
}

/**
 * 初始化主题加载器
 * 使用 Vite 的 Glob Import 特性，在构建时收集所有主题文件
 */
function initThemeLoaders() {
  if (themeLoaders)
    return themeLoaders

  // 使用 import.meta.glob 预定义所有主题导入
  // query: '?raw' 返回文件内容字符串
  // import: 'default' 导入默认导出
  // eager: false 表示按需异步加载
  const modules = import.meta.glob('@/assets/style/code-theme/theme/*.scss', {
    query: '?raw',
    import: 'default',
    eager: false,
  })

  // 转换为以主题名为 key 的映射
  themeLoaders = new Map()
  for (const [path, loader] of Object.entries(modules)) {
    const match = path.match(/theme\/(\w[\w-]*)\.scss$/)
    if (match) {
      themeLoaders.set(match[1], loader)
    }
  }

  return themeLoaders
}

/**
 * 动态加载代码主题 CSS
 * @param {string} themeName - 主题名称
 * @returns {Promise<void>}
 */
export async function loadCodeTheme(themeName) {
  // 验证主题名称
  if (!themeName || typeof themeName !== 'string') {
    console.warn('[codeTheme] Invalid theme name:', themeName)
    return
  }

  // 如果主题名称无效，使用默认主题
  const targetTheme = isValidTheme(themeName) ? themeName : 'github'

  // 如果当前已经应用了这个主题，直接返回
  if (currentTheme === targetTheme) {
    return
  }

  try {
    let cssContent

    // 1. 先检查内存缓存
    if (themeCssCache.has(targetTheme)) {
      cssContent = themeCssCache.get(targetTheme)
    }
    else {
      // 2. 从加载器获取
      const loaders = initThemeLoaders()
      const loader = loaders.get(targetTheme)

      // 3. 执行加载函数获取 CSS 内容
      cssContent = await loader()

      // 4. 缓存 CSS 内容
      themeCssCache.set(targetTheme, cssContent)

      // 5. 限制缓存数量，最多保留 5 个主题
      if (themeCssCache.size > 5) {
        const firstKey = themeCssCache.keys().next().value
        themeCssCache.delete(firstKey)
      }
    }

    // 应用样式
    applyThemeStyle(cssContent)

    // 更新当前主题
    currentTheme = targetTheme
  } catch {
    // 如果加载失败且不是默认主题，尝试回退到 github 主题
    if (targetTheme !== 'github' && currentTheme !== 'github') {
      await loadCodeTheme('github')
    }
  }
}
