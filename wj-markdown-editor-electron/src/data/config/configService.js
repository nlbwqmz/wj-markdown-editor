import { sanitizeLoadedConfig } from './configLoadSanitizer.js'
import { repairConfig } from './configRepairUtil.js'
import { configSchema, validateConfigShape } from './configSchema.js'
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
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertPatchValueSupported(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || isPlainObject(value)) {
    return
  }

  throw new TypeError('配置 patch 仅支持 plain object、数组、原始值或 null')
}

function mergeConfigPatch(target, patch) {
  if (!isPlainObject(target) || !isPlainObject(patch)) {
    return cloneConfig(patch)
  }

  const merged = { ...target }

  for (const key in patch) {
    if (Object.prototype.hasOwnProperty.call(merged, key) === false) {
      throw new TypeError('配置 patch 包含未知字段')
    }

    const nextValue = patch[key]
    const currentValue = merged[key]
    assertPatchValueSupported(nextValue)

    if (isPlainObject(currentValue)) {
      if (isPlainObject(nextValue) === false) {
        throw new TypeError('配置对象字段只接受 plain object patch')
      }

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
  let configUpdateQueue = Promise.resolve()

  function getCurrentConfigOrDefault() {
    return currentConfig ? cloneConfig(currentConfig) : cloneConfig(defaultConfig)
  }

  function runConfigUpdate(task) {
    const nextTask = configUpdateQueue.then(task, task)
    configUpdateQueue = nextTask.catch(() => {})
    return nextTask
  }

  function normalizeConfigForLoad(rawConfig) {
    const repairedConfig = repairConfig(rawConfig, defaultConfig)
    const sanitizedConfig = sanitizeLoadedConfig(repairedConfig, defaultConfig, configSchema)
    validateConfigShape(sanitizedConfig)
    return sanitizedConfig
  }

  function normalizeConfigForWrite(rawConfig) {
    const repairedConfig = repairConfig(rawConfig, defaultConfig)
    if (JSON.stringify(repairedConfig) !== JSON.stringify(rawConfig)) {
      throw new Error('配置写入 patch 触发了静默修复')
    }

    validateConfigShape(repairedConfig)
    return repairedConfig
  }

  function buildNextConfig(nextPartial) {
    if (!isPlainObject(nextPartial)) {
      return {
        ok: false,
        result: createInvalidConfigResult(),
      }
    }

    try {
      return {
        ok: true,
        nextConfig: normalizeConfigForWrite(mergeConfigPatch(getCurrentConfigOrDefault(), nextPartial)),
      }
    }
    catch {
      return {
        ok: false,
        result: createInvalidConfigResult(),
      }
    }
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

  async function syncRecentMaxBestEffort(recentStore, nextRecentMax) {
    if (typeof recentStore?.setMax !== 'function') {
      return
    }

    try {
      // recentMax 这里只是运行期上限同步，失败不能回滚已经成功提交的配置状态。
      await recentStore.setMax(nextRecentMax, { notify: false })
    }
    catch (error) {
      console.error('[configService] recentStore.setMax failed after config persisted:', error)
    }
  }

  async function setConfigWithRecentMax(nextPartial, recentStore) {
    return await runConfigUpdate(async () => {
      const buildResult = buildNextConfig(nextPartial)
      if (!buildResult.ok) {
        return buildResult.result
      }

      const nextConfig = buildResult.nextConfig
      const persistResult = await persistConfig(nextConfig)
      if (persistResult.ok === false) {
        return persistResult
      }

      // recentMax 更新后只同步运行期上限，不在这里裁剪 recent 列表或广播 recent 变化。
      await syncRecentMaxBestEffort(recentStore, nextConfig.recentMax)

      return persistResult
    })
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
        normalizedConfig = normalizeConfigForLoad(rawConfig)
      }
      catch {
        // 初始化阶段如果修复后仍不合法，继续回退到默认配置保证 service 内存态始终可用。
        normalizedConfig = normalizeConfigForLoad(cloneConfig(defaultConfig))
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
      return await runConfigUpdate(async () => {
        const buildResult = buildNextConfig(nextPartial)
        if (!buildResult.ok) {
          return buildResult.result
        }

        return await persistConfig(buildResult.nextConfig)
      })
    },
    setConfigWithRecentMax,
    async setThemeGlobal(theme) {
      return await runConfigUpdate(async () => {
        let nextConfig = null

        try {
          nextConfig = normalizeConfigForWrite(mergeConfigPatch(getCurrentConfigOrDefault(), {
            theme: {
              global: theme,
            },
          }))
        }
        catch {
          return createInvalidConfigResult()
        }

        return await persistConfig(nextConfig)
      })
    },
    async setLanguage(language) {
      return await runConfigUpdate(async () => {
        let nextConfig = null

        try {
          nextConfig = normalizeConfigForWrite(mergeConfigPatch(getCurrentConfigOrDefault(), {
            language,
          }))
        }
        catch {
          return createInvalidConfigResult()
        }

        return await persistConfig(nextConfig)
      })
    },
  }
}
