import path from 'node:path'
import fsExtra from 'fs-extra'
import writeFileAtomicDefault from 'write-file-atomic'
import { configFileName, resolveConfigDir } from './configConstants.js'

export function createConfigRepository({
  app,
  fs = fsExtra,
  writeFileAtomic = writeFileAtomicDefault,
}) {
  const configDir = resolveConfigDir(app)
  const configPath = path.join(configDir, configFileName)

  return {
    getConfigDir() {
      return configDir
    },
    getConfigPath() {
      return configPath
    },
    async ensureConfigDir() {
      // 确保配置目录存在，供首次写入和损坏备份复用。
      await fs.ensureDir(configDir)
    },
    async readConfigText() {
      return fs.readFile(configPath, 'utf8')
    },
    async readParsedConfig() {
      const rawText = await this.readConfigText()

      try {
        return JSON.parse(rawText)
      }
      catch (parseFailure) {
        const parseError = new Error('CONFIG_PARSE_FAILED')
        parseError.cause = parseFailure

        try {
          parseError.backupPath = await this.backupCorruptedConfig(rawText)
        }
        catch (backupError) {
          // 备份失败只作为附加诊断信息，不能覆盖统一的解析失败错误边界。
          parseError.backupError = backupError
        }

        throw parseError
      }
    },
    async writeConfigText(text) {
      await this.ensureConfigDir()
      await writeFileAtomic(configPath, text, { encoding: 'utf8' })
    },
    async backupCorruptedConfig(rawText) {
      await this.ensureConfigDir()

      const backupPath = path.join(
        configDir,
        `config.corrupted.${Date.now()}.json`,
      )

      await fs.writeFile(backupPath, rawText, 'utf8')
      return backupPath
    },
  }
}
