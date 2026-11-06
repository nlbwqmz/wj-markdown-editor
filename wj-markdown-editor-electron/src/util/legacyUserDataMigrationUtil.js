import path from 'node:path'
import fsExtra from 'fs-extra'
import { USER_DATA_SUBDIR } from './userDataPathConstants.js'

// 旧版本把用户数据统一写在 `文档/wj-markdown-editor` 下，
// 迁移目标目录由 resolveUserDataDir 决定（生产态即 app.getPath('userData')/data）。
const LEGACY_DIR_NAME = 'wj-markdown-editor'
const MIGRATION_MARKER = '.migrated-from-documents'
const MIGRATABLE_FILE_NAMES = new Set(['config.json', 'recent.json', 'tab-group.json'])
const MIGRATABLE_DIR_NAMES = new Set(['logs'])
const CORRUPTED_CONFIG_FILE_PATTERN = /^config\.corrupted\..+\.json$/

export { MIGRATION_MARKER }

function isMigratableEntry(entryName) {
  return MIGRATABLE_FILE_NAMES.has(entryName)
    || MIGRATABLE_DIR_NAMES.has(entryName)
    || CORRUPTED_CONFIG_FILE_PATTERN.test(entryName)
}

export function resolveLegacyUserDataDir({ app }) {
  return path.resolve(app.getPath('documents'), LEGACY_DIR_NAME)
}

/**
 * 把旧文档目录下的用户数据迁移到新的用户数据目录。
 *
 * 约定：
 * 1. 目标目录已有同名条目时以目标为准，不覆盖（新目录的数据更新）
 * 2. 全部条目处理成功后才写 marker；失败不写，下次启动重试
 * 3. marker 存在时不再回看旧目录，避免用户删掉新配置后旧文件“复活”
 * 4. 迁移成功后删除旧目录，同一份配置不允许存在两个位置
 */
export async function migrateLegacyUserData({
  app,
  fs = fsExtra,
  targetDir,
  logger = console,
}) {
  const normalizedTargetDir = path.resolve(targetDir)
  const legacyDir = resolveLegacyUserDataDir({ app })

  // 开发态目标就是应用目录下的 data 子目录；目标与旧目录重合时也不存在迁移意义。
  if (legacyDir === normalizedTargetDir || path.resolve(app.getAppPath(), USER_DATA_SUBDIR) === normalizedTargetDir) {
    return { status: 'skipped' }
  }

  const markerPath = path.join(normalizedTargetDir, MIGRATION_MARKER)
  if (await fs.pathExists(markerPath)) {
    return { status: 'already-migrated' }
  }

  if (!await fs.pathExists(legacyDir)) {
    await writeMigrationMarker()
    return { status: 'no-legacy-data' }
  }

  const migratedEntries = []
  try {
    const legacyEntries = await fs.readdir(legacyDir)
    for (const entryName of legacyEntries) {
      if (!isMigratableEntry(entryName)) {
        continue
      }

      const sourcePath = path.join(legacyDir, entryName)
      const targetPath = path.join(normalizedTargetDir, entryName)
      const isDirectoryEntry = MIGRATABLE_DIR_NAMES.has(entryName)
      if (!isDirectoryEntry && await fs.pathExists(targetPath)) {
        continue
      }

      await fs.ensureDir(normalizedTargetDir)
      await fs.copy(sourcePath, targetPath, { overwrite: false, errorOnExist: false })
      migratedEntries.push(entryName)
    }

    await writeMigrationMarker()
  }
  catch (error) {
    // 迁移失败不写 marker，旧目录保持原样，下次启动重试。
    logger.error?.('[migration] 旧用户数据迁移失败，下次启动重试:', error)
    return { status: 'failed', error }
  }

  try {
    await fs.remove(legacyDir)
  }
  catch (error) {
    // 清理失败不影响迁移结果，旧目录最多留一份副本。
    logger.warn?.('[migration] 旧用户数据目录清理失败:', error)
  }

  logger.info?.('[migration] 已迁移旧用户数据:', migratedEntries)
  return { status: 'migrated', migratedEntries }

  async function writeMigrationMarker() {
    await fs.ensureDir(normalizedTargetDir)
    await fs.writeFile(markerPath, new Date().toISOString(), 'utf-8')
  }
}
