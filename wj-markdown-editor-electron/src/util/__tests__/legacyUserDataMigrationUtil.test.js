import os from 'node:os'
import path from 'node:path'
import fsExtra from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  migrateLegacyUserData,
  MIGRATION_MARKER,
  resolveLegacyUserDataDir,
} from '../legacyUserDataMigrationUtil.js'
import { USER_DATA_SUBDIR } from '../userDataPathConstants.js'

describe('migrateLegacyUserData', () => {
  let rootDir
  let documentsDir
  let userDataDir
  let dataDir
  let app

  beforeEach(async () => {
    rootDir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'wj-legacy-migration-'))
    documentsDir = path.join(rootDir, 'Documents')
    userDataDir = path.join(rootDir, 'userData')
    dataDir = path.join(userDataDir, USER_DATA_SUBDIR)
    app = {
      getAppPath: () => path.join(rootDir, 'app'),
      getPath: name => (name === 'documents' ? documentsDir : userDataDir),
    }
  })

  afterEach(async () => {
    await fsExtra.remove(rootDir)
  })

  async function seedLegacyData() {
    const legacyDir = resolveLegacyUserDataDir({ app })
    await fsExtra.ensureDir(path.join(legacyDir, 'logs', '2026-01-01'))
    await fsExtra.writeFile(path.join(legacyDir, 'config.json'), '{"language":"zh-CN"}', 'utf8')
    await fsExtra.writeFile(path.join(legacyDir, 'recent.json'), '["D:/docs/a.md"]', 'utf8')
    await fsExtra.writeFile(path.join(legacyDir, 'tab-group.json'), '{"tabs":[]}', 'utf8')
    await fsExtra.writeFile(path.join(legacyDir, 'config.corrupted.1.json'), '{"broken": }', 'utf8')
    await fsExtra.writeFile(path.join(legacyDir, 'logs', '2026-01-01', 'main.log'), 'legacy log', 'utf8')
    return legacyDir
  }

  it('必须迁移配置、最近文件、标签组、日志与损坏备份，并删除旧目录', async () => {
    const legacyDir = await seedLegacyData()

    const result = await migrateLegacyUserData({ app, targetDir: dataDir })

    expect(result.status).toBe('migrated')
    expect(result.migratedEntries).toEqual(expect.arrayContaining([
      'config.json',
      'recent.json',
      'tab-group.json',
      'logs',
      'config.corrupted.1.json',
    ]))
    await expect(fsExtra.readFile(path.join(dataDir, 'config.json'), 'utf8'))
      .resolves
      .toBe('{"language":"zh-CN"}')
    await expect(fsExtra.readFile(path.join(dataDir, 'recent.json'), 'utf8'))
      .resolves
      .toBe('["D:/docs/a.md"]')
    await expect(fsExtra.readFile(path.join(dataDir, 'logs', '2026-01-01', 'main.log'), 'utf8'))
      .resolves
      .toBe('legacy log')
    await expect(fsExtra.pathExists(path.join(dataDir, MIGRATION_MARKER))).resolves.toBe(true)
    // 迁移完成后不允许同一份数据存在两个位置
    await expect(fsExtra.pathExists(legacyDir)).resolves.toBe(false)
  })

  it('目标目录已有同名文件时不得覆盖', async () => {
    await seedLegacyData()
    await fsExtra.ensureDir(dataDir)
    await fsExtra.writeFile(path.join(dataDir, 'config.json'), '{"language":"en-US"}', 'utf8')

    await migrateLegacyUserData({ app, targetDir: dataDir })

    await expect(fsExtra.readFile(path.join(dataDir, 'config.json'), 'utf8'))
      .resolves
      .toBe('{"language":"en-US"}')
  })

  it('marker 存在时不得再回看旧目录', async () => {
    const legacyDir = await seedLegacyData()
    await fsExtra.ensureDir(dataDir)
    await fsExtra.writeFile(path.join(dataDir, MIGRATION_MARKER), 'done', 'utf8')

    const result = await migrateLegacyUserData({ app, targetDir: dataDir })

    expect(result.status).toBe('already-migrated')
    await expect(fsExtra.pathExists(legacyDir)).resolves.toBe(true)
  })

  it('旧目录不存在时直接写 marker，后续启动不再扫描', async () => {
    const result = await migrateLegacyUserData({ app, targetDir: dataDir })

    expect(result.status).toBe('no-legacy-data')
    await expect(fsExtra.pathExists(path.join(dataDir, MIGRATION_MARKER))).resolves.toBe(true)
  })

  it('开发态目标为应用目录下的 data 子目录时必须跳过，不能迁移也不能删除', async () => {
    const legacyDir = await seedLegacyData()
    const devDataDir = path.join(app.getAppPath(), USER_DATA_SUBDIR)

    const result = await migrateLegacyUserData({ app, targetDir: devDataDir })

    expect(result.status).toBe('skipped')
    await expect(fsExtra.pathExists(legacyDir)).resolves.toBe(true)
  })

  it('重复启动必须幂等：第二次只返回 already-migrated，不重复复制也不重建旧目录', async () => {
    const legacyDir = await seedLegacyData()

    const first = await migrateLegacyUserData({ app, targetDir: dataDir })
    const second = await migrateLegacyUserData({ app, targetDir: dataDir })

    expect(first.status).toBe('migrated')
    expect(second.status).toBe('already-migrated')
    await expect(fsExtra.pathExists(legacyDir)).resolves.toBe(false)
    await expect(fsExtra.readFile(path.join(dataDir, 'config.json'), 'utf8'))
      .resolves
      .toBe('{"language":"zh-CN"}')
  })

  it('上次迁移中途失败后，重启重试必须补齐剩余条目且不重复覆盖', async () => {
    const legacyDir = await seedLegacyData()
    const originalCopy = fsExtra.copy
    let copyCount = 0
    const copySpy = vi.spyOn(fsExtra, 'copy').mockImplementation(async (...args) => {
      copyCount += 1
      if (copyCount > 1) {
        throw new Error('copy failed')
      }
      return await originalCopy(...args)
    })

    try {
      const failedResult = await migrateLegacyUserData({
        app,
        targetDir: dataDir,
        logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      })
      expect(failedResult.status).toBe('failed')
      await expect(fsExtra.pathExists(legacyDir)).resolves.toBe(true)
    }
    finally {
      copySpy.mockRestore()
    }

    const retryResult = await migrateLegacyUserData({ app, targetDir: dataDir })

    expect(retryResult.status).toBe('migrated')
    await expect(fsExtra.pathExists(path.join(dataDir, 'recent.json'))).resolves.toBe(true)
    await expect(fsExtra.readFile(path.join(dataDir, 'config.json'), 'utf8'))
      .resolves
      .toBe('{"language":"zh-CN"}')
    await expect(fsExtra.pathExists(legacyDir)).resolves.toBe(false)
  })

  it('复制失败时不得写 marker，且必须保留旧目录供下次重试', async () => {
    const legacyDir = await seedLegacyData()
    const copySpy = vi.spyOn(fsExtra, 'copy').mockRejectedValueOnce(new Error('copy failed'))
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

    try {
      const result = await migrateLegacyUserData({ app, targetDir: dataDir, logger })

      expect(result.status).toBe('failed')
      expect(logger.error).toHaveBeenCalled()
      await expect(fsExtra.pathExists(path.join(dataDir, MIGRATION_MARKER))).resolves.toBe(false)
      await expect(fsExtra.pathExists(legacyDir)).resolves.toBe(true)
    }
    finally {
      copySpy.mockRestore()
    }
  })
})
