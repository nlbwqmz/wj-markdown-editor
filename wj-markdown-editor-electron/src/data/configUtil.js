import { app } from 'electron'
import { createConfigRepository } from './config/configRepository.js'
import { createConfigService } from './config/configService.js'
import { cloneConfig } from './config/configSnapshotUtil.js'
import defaultConfig from './defaultConfig.js'

// 兼容层继续维持既有导出形态，内部统一委托给新的配置服务。
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
  setConfig: data => configService.setConfig(data),
  setThemeGlobal: data => configService.setThemeGlobal(data),
  setLanguage: data => configService.setLanguage(data),
  getDefaultConfig: () => {
    return cloneConfig(defaultConfig)
  },
}
