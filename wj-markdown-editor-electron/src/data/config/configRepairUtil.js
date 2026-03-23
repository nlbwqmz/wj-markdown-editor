function cloneConfigValue(value) {
  return JSON.parse(JSON.stringify(value))
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

export function repairConfig(rawConfig = {}, defaultConfig) {
  const merged = mergeAndPrune(rawConfig, defaultConfig)

  merged.shortcutKeyList = repairShortcutKeyList(rawConfig.shortcutKeyList, defaultConfig.shortcutKeyList)

  // 历史 preview 主题名 github-light 已废弃，这里统一迁移到 github。
  if (merged.theme.preview === 'github-light') {
    merged.theme.preview = 'github'
  }

  return merged
}
