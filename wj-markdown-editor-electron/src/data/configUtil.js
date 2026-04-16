import { app } from 'electron'
import { createConfigRepository } from './config/configRepository.js'
import { createConfigService } from './config/configService.js'
import { cloneConfig } from './config/configSnapshotUtil.js'
import defaultConfig from './defaultConfig.js'

// 配置工具层只暴露统一更新入口，避免继续扩散 legacy setter。
const configRepository = createConfigRepository({ app })
const configService = createConfigService({
  defaultConfig,
  repository: configRepository,
})

export default {
  initConfig: callback => configService.init(callback),
  getConfig: () => {
    return configService.getConfig()
  },
  updateConfig: (request, recentStore) => configService.updateConfig(request, recentStore),
  getDefaultConfig: () => {
    return cloneConfig(defaultConfig)
  },
}
