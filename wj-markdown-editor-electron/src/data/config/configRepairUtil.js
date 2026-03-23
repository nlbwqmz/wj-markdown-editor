function cloneConfigValue(value) {
  return JSON.parse(JSON.stringify(value))
}

const configEnumOptions = {
  imgMode: ['1', '2', '3', '4', '5'],
  fileMode: ['2', '3', '4'],
  autoSave: ['blur', 'close'],
  startPage: ['editor', 'preview'],
  language: ['zh-CN', 'en-US'],
  externalFileChangeStrategy: ['apply', 'prompt'],
  themeGlobal: ['light', 'dark'],
}

function mergeAndPrune(target, desc) {
  // 描述值不是对象时，保留已有值，维持历史兼容语义。
  if (typeof desc !== 'object' || desc === null) {
    return target
  }

  if (Array.isArray(desc)) {
    // 旧配置类型不匹配时保持原值，避免意外覆盖。
    if (!Array.isArray(target)) {
      return target
    }

    const result = [...target]
    for (let i = 0; i < desc.length; i++) {
      if (i < result.length) {
        result[i] = mergeAndPrune(result[i], desc[i])
      } else {
        result.push(cloneConfigValue(desc[i]))
      }
    }
    return result
  }

  const result = typeof target === 'object' && target !== null && !Array.isArray(target)
    ? { ...target }
    : {}

  // 删除默认配置中已不存在的字段，避免旧配置脏数据残留。
  for (const key in result) {
    if (!(key in desc)) {
      delete result[key]
    }
  }

  // 为缺失字段补默认值，同时递归修复嵌套结构。
  for (const key in desc) {
    if (!(key in result)) {
      result[key] = cloneConfigValue(desc[key])
    } else {
      result[key] = mergeAndPrune(result[key], desc[key])
    }
  }

  return result
}

function repairShortcutKeyList(shortcutKeyList, defaultShortcutKeyList) {
  const rawShortcutKeyList = Array.isArray(shortcutKeyList) ? shortcutKeyList : []

  // 快捷键项必须按 id 对齐默认值重建，避免数组按下标合并导致字段串位。
  const repairedShortcutKeyList = rawShortcutKeyList
    .map((item) => {
      const defaultShortcutKey = defaultShortcutKeyList.find(temp => temp.id === item.id)
      if (!defaultShortcutKey) {
        return null
      }

      return mergeAndPrune(item, defaultShortcutKey)
    })
    .filter(item => item !== null)

  // 补齐新版本新增的快捷键，保持配置列表完整。
  defaultShortcutKeyList.forEach((item) => {
    if (repairedShortcutKeyList.some(temp => temp.id === item.id) === false) {
      repairedShortcutKeyList.push(cloneConfigValue(item))
    }
  })

  // 统一回填默认顺序，沿用当前兼容修复行为。
  repairedShortcutKeyList.forEach((item) => {
    const defaultShortcutKey = defaultShortcutKeyList.find(temp => temp.id === item.id)
    if (defaultShortcutKey) {
      item.index = defaultShortcutKey.index
    }
  })

  repairedShortcutKeyList.sort((a, b) => a.index - b.index)

  return repairedShortcutKeyList
}

function repairEnumValue(value, defaultValue, allowedValues) {
  if (allowedValues.includes(value)) {
    return value
  }

  return defaultValue
}

function repairStringValue(value, defaultValue) {
  return typeof value === 'string' ? value : defaultValue
}

function repairBooleanValue(value, defaultValue) {
  return typeof value === 'boolean' ? value : defaultValue
}

function repairNumberValue(value, defaultValue, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return defaultValue
  }

  return Math.min(Math.max(value, min), max)
}

function repairAutoSave(autoSave, defaultAutoSave) {
  if (!Array.isArray(autoSave)) {
    return cloneConfigValue(defaultAutoSave)
  }

  const repaired = []
  const seen = new Set()

  autoSave.forEach((item) => {
    if (configEnumOptions.autoSave.includes(item) && seen.has(item) === false) {
      repaired.push(item)
      seen.add(item)
    }
  })

  return repaired
}

function normalizeConfigFields(config, defaultConfig) {
  // 配置版本始终跟随当前版本，避免旧版本号残留导致 schema 失败。
  config.configVersion = defaultConfig.configVersion

  config.imgLocal = repairEnumValue(config.imgLocal, defaultConfig.imgLocal, configEnumOptions.imgMode)
  config.imgNetwork = repairEnumValue(config.imgNetwork, defaultConfig.imgNetwork, configEnumOptions.imgMode)
  config.fileMode = repairEnumValue(config.fileMode, defaultConfig.fileMode, configEnumOptions.fileMode)
  config.startPage = repairEnumValue(config.startPage, defaultConfig.startPage, configEnumOptions.startPage)
  config.language = repairEnumValue(config.language, defaultConfig.language, configEnumOptions.language)
  config.externalFileChangeStrategy = repairEnumValue(
    config.externalFileChangeStrategy,
    defaultConfig.externalFileChangeStrategy,
    configEnumOptions.externalFileChangeStrategy,
  )
  config.recentMax = repairNumberValue(config.recentMax, defaultConfig.recentMax, { min: 0, max: 50 })
  config.autoSave = repairAutoSave(config.autoSave, defaultConfig.autoSave)

  // theme.preview 的 github-light 迁移先于类型修复，避免历史值被直接覆盖成默认主题。
  if (config.theme.preview === 'github-light') {
    config.theme.preview = 'github'
  }

  config.theme.global = repairEnumValue(config.theme.global, defaultConfig.theme.global, configEnumOptions.themeGlobal)
  config.theme.code = repairStringValue(config.theme.code, defaultConfig.theme.code)
  config.theme.preview = repairStringValue(config.theme.preview, defaultConfig.theme.preview)

  config.imgAbsolutePath = repairStringValue(config.imgAbsolutePath, defaultConfig.imgAbsolutePath)
  config.imgRelativePath = repairStringValue(config.imgRelativePath, defaultConfig.imgRelativePath)
  config.fileAbsolutePath = repairStringValue(config.fileAbsolutePath, defaultConfig.fileAbsolutePath)
  config.fileRelativePath = repairStringValue(config.fileRelativePath, defaultConfig.fileRelativePath)
  config.menuVisible = repairBooleanValue(config.menuVisible, defaultConfig.menuVisible)
  config.previewWidth = repairNumberValue(config.previewWidth, defaultConfig.previewWidth)
  config.fontSize = repairNumberValue(config.fontSize, defaultConfig.fontSize)
  config.openRecent = repairBooleanValue(config.openRecent, defaultConfig.openRecent)

  return config
}

export function repairConfig(rawConfig = {}, defaultConfig) {
  const merged = mergeAndPrune(rawConfig, defaultConfig)

  merged.shortcutKeyList = repairShortcutKeyList(rawConfig.shortcutKeyList, defaultConfig.shortcutKeyList)
  return normalizeConfigFields(merged, defaultConfig)
}
