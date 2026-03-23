import { repairConfig } from './configRepairUtil.js'
import { validateConfigShape } from './configSchema.js'
import { cloneConfig } from './configSnapshotUtil.js'

function createWriteFailedResult() {
  return {
    ok: false,
    reason: 'config-write-failed',
    messageKey: 'message.configWriteFailed',
  }
}

function createInvalidConfigResult() {
  return {
    ok: false,
    reason: 'config-invalid',
    messageKey: 'message.configInvalid',
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeConfigPatch(target, patch) {
  if (!isPlainObject(target) || !isPlainObject(patch)) {
    return cloneConfig(patch)
  }

  const merged = { ...target }

  for (const key in patch) {
    const nextValue = patch[key]
    const currentValue = merged[key]

    if (isPlainObject(currentValue) && isPlainObject(nextValue)) {
      merged[key] = mergeConfigPatch(currentValue, nextValue)
      continue
    }

    merged[key] = cloneConfig(nextValue)
  }

  return merged
}

export function createConfigService(deps) {
  const {
    defaultConfig,
    repository,
  } = deps

  let currentConfig = null
  let updateCallback = null

  function getCurrentConfigOrDefault() {
    return currentConfig ? cloneConfig(currentConfig) : cloneConfig(defaultConfig)
  }

  function normalizeConfig(rawConfig) {
    const repairedConfig = repairConfig(rawConfig, defaultConfig)
    validateConfigShape(repairedConfig)
    return repairedConfig
  }

  async function persistConfig(nextConfig) {
    // 运行期更新必须先写盘成功，再推进内存态和广播，避免状态前移。
    try {
      await repository.writeConfigText(JSON.stringify(nextConfig))
    }
    catch {
      return createWriteFailedResult()
    }

    currentConfig = cloneConfig(nextConfig)

    if (updateCallback) {
      updateCallback(cloneConfig(currentConfig))
    }

    return {
      ok: true,
      config: cloneConfig(currentConfig),
    }
  }

  return {
    async init(callback) {
      updateCallback = callback ?? null

      let rawConfig = null
      let shouldRewriteConfig = false

      try {
        rawConfig = await repository.readParsedConfig()
      }
      catch {
        // 初始化允许读失败降级，直接回退到默认配置继续启动。
        rawConfig = cloneConfig(defaultConfig)
        shouldRewriteConfig = true
      }

      let normalizedConfig = null

      try {
        normalizedConfig = normalizeConfig(rawConfig)
      }
      catch {
        // 初始化阶段如果修复后仍不合法，继续回退到默认配置保证 service 内存态始终可用。
        normalizedConfig = normalizeConfig(cloneConfig(defaultConfig))
        shouldRewriteConfig = true
      }

      const repairedText = JSON.stringify(normalizedConfig)

      if (!shouldRewriteConfig) {
        // 只有修复结果与原始配置不一致时才执行规范化回写。
        shouldRewriteConfig = JSON.stringify(rawConfig) !== repairedText
      }

      currentConfig = cloneConfig(normalizedConfig)

      if (shouldRewriteConfig) {
        try {
          await repository.writeConfigText(repairedText)
        }
        catch {
          // 初始化阶段允许降级到内存态继续运行，避免配置损坏时阻断启动。
        }
      }
    },
    getConfig() {
      return getCurrentConfigOrDefault()
    },
    async setConfig(nextPartial) {
      if (!isPlainObject(nextPartial)) {
        return createInvalidConfigResult()
      }

      let nextConfig = null

      try {
        nextConfig = normalizeConfig(mergeConfigPatch(getCurrentConfigOrDefault(), nextPartial))
      }
      catch {
        return createInvalidConfigResult()
      }

      return persistConfig(nextConfig)
    },
    async setThemeGlobal(theme) {
      let nextConfig = null

      try {
        nextConfig = normalizeConfig(mergeConfigPatch(getCurrentConfigOrDefault(), {
          theme: {
            global: theme,
          },
        }))
      }
      catch {
        return createInvalidConfigResult()
      }

      return persistConfig(nextConfig)
    },
    async setLanguage(language) {
      let nextConfig = null

      try {
        nextConfig = normalizeConfig(mergeConfigPatch(getCurrentConfigOrDefault(), {
          language,
        }))
      }
      catch {
        return createInvalidConfigResult()
      }

      return persistConfig(nextConfig)
    },
  }
}
