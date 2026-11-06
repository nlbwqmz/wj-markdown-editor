import path from 'node:path'
import fsExtra from 'fs-extra'
import writeFileAtomicDefault from 'write-file-atomic'
import { configFileName, resolveConfigDir } from './configConstants.js'

export function createConfigRepository({
  app,
  env = process.env,
  fs = fsExtra,
  writeFileAtomic = writeFileAtomicDefault,
}) {
  // 目录必须惰性解析：启动早期的旧数据迁移先于任何配置读写，
  // 构造期固化会让配置目录停留在迁移前的旧路径上。
  const getConfigDir = () => resolveConfigDir({ app, env })
  const getConfigPath = () => path.join(getConfigDir(), configFileName)

  return {
    getConfigDir,
    getConfigPath,
    async ensureConfigDir() {
      // 确保配置目录存在，供首次写入和损坏备份复用。
      await fs.ensureDir(getConfigDir())
    },
    async readConfigText() {
      return fs.readFile(getConfigPath(), 'utf8')
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
      await writeFileAtomic(getConfigPath(), text, { encoding: 'utf8' })
    },
    async backupCorruptedConfig(rawText) {
      await this.ensureConfigDir()

      const backupPath = path.join(
        getConfigDir(),
        `config.corrupted.${Date.now()}.json`,
      )

      await fs.writeFile(backupPath, rawText, 'utf8')
      return backupPath
    },
  }
}
