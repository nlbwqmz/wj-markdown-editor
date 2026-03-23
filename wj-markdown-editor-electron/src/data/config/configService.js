import { repairConfig } from './configRepairUtil.js'
import { cloneConfig } from './configSnapshotUtil.js'

function createWriteFailedResult() {
  return {
    ok: false,
    reason: 'config-write-failed',
    messageKey: 'message.configWriteFailed',
  }
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

      const repairedConfig = repairConfig(rawConfig, defaultConfig)
      const repairedText = JSON.stringify(repairedConfig)

      if (!shouldRewriteConfig) {
        // 只有修复结果与原始配置不一致时才执行规范化回写。
        shouldRewriteConfig = JSON.stringify(rawConfig) !== repairedText
      }

      currentConfig = cloneConfig(repairedConfig)

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
      const nextConfig = getCurrentConfigOrDefault()

      for (const key in nextPartial) {
        nextConfig[key] = nextPartial[key]
      }

      return persistConfig(nextConfig)
    },
    async setThemeGlobal(theme) {
      const nextConfig = getCurrentConfigOrDefault()
      nextConfig.theme.global = theme
      return persistConfig(nextConfig)
    },
    async setLanguage(language) {
      const nextConfig = getCurrentConfigOrDefault()
      nextConfig.language = language
      return persistConfig(nextConfig)
    },
  }
}
