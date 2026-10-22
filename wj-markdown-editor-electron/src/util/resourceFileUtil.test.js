import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { convertResourceUrl } from '../../../wj-markdown-editor-web/src/util/resourceUrlUtil.js'
import resourceFileUtil from './resourceFileUtil.js'

// 被测代码使用平台相关的 `node:path`，因此测试里的“绝对路径”必须按当前平台构造：
// Windows 下 `path.resolve('/docs')` 得到 `<当前盘符>:\docs`，Linux 下得到 `/docs`。
const DOC_ROOT = path.resolve('/docs')
const DOC_PATH = path.join(DOC_ROOT, 'note.md')
const ASSETS_DIR = path.join(DOC_ROOT, 'assets')
const ASSET_PATH = path.join(ASSETS_DIR, 'demo.png')
const DOCS_SUB_DIR = path.join(DOC_ROOT, 'docs')
const DOCS_INDEX_HTML_PATH = path.join(DOCS_SUB_DIR, 'index.html')
const ASSET_TXT_PATH = path.join(ASSETS_DIR, 'asset.txt')
const ASSET_DEMO_MD_PATH = path.join(ASSETS_DIR, 'demo.md')
const ASSET_DEMO_SHARP_GUIDE_PATH = path.join(ASSETS_DIR, 'demo#guide.md')
const ASSET_DEMO_QUESTION_GUIDE_PATH = path.join(ASSETS_DIR, 'demo?guide.md')
const ASSET_SHARP_MD_PATH = path.join(ASSETS_DIR, 'a#b.md')
const ASSET_FROM_RAW_PATH = path.join(ASSETS_DIR, 'from-raw.png')

// 文档目录之外的绝对路径：`<DOC_ROOT>/..` 归一化后即 `<根>/assets`，用于点段归一化用例。
const OUTSIDE_ASSET_PATH = path.resolve(DOC_ROOT, '..', 'assets', 'demo.png')
// 保留 `..` 字面量的原始输入，避免被 `path.join` 提前归一化掉。
const POINT_SEGMENT_ASSET_PATH = `${DOC_ROOT}${path.sep}..${path.sep}assets${path.sep}demo.png`

// 绝对路径 payload 也必须平台化：`D:/images/demo.png` 在 Linux 上不是绝对路径。
const ABS_IMAGE_PATH = path.resolve('/images/demo.png')
const ABS_IMAGE_URL = convertResourceUrl(ABS_IMAGE_PATH)

/**
 * 资源 URL 解码出的本地路径统一使用 `/` 分隔符（convertResourceUrl 内部已先做分隔符归一化）。
 */
function toResourcePath(targetPath) {
  return targetPath.replace(/\\/g, '/')
}

/**
 * 比较 key 的期望值：分隔符统一为 `/`，盘符路径整体小写；测试用路径全为小写，故统一小写即可。
 */
function toComparableKey(targetPath) {
  return `wj-local-file:${toResourcePath(targetPath).toLowerCase()}`
}

const { pathExists, pathExistsSync, remove, stat } = vi.hoisted(() => {
  return {
    pathExists: vi.fn(),
    pathExistsSync: vi.fn(),
    remove: vi.fn(),
    stat: vi.fn(),
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      pathExists,
      pathExistsSync,
      remove,
      stat,
    },
  }
})

describe('resourceFileUtil.resolveLocalResourcePath', () => {
  it('应该支持解析绝对路径资源 URL', () => {
    const result = resourceFileUtil.resolveLocalResourcePath({
      documentPath: DOC_PATH,
    }, ABS_IMAGE_URL)

    expect(result).toBe(toResourcePath(ABS_IMAGE_PATH))
  })

  it('应该将相对路径资源解析到当前 markdown 文件目录', () => {
    const result = resourceFileUtil.resolveLocalResourcePath({
      documentPath: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toBe(ASSET_PATH)
  })

  it('当前文件未保存时，应该拒绝解析相对路径资源', () => {
    const result = resourceFileUtil.resolveLocalResourcePath({
      documentPath: '',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toBeNull()
  })

  it('非法 payload 时，应该安全返回 null 而不是抛错', () => {
    const result = resourceFileUtil.resolveLocalResourcePath({
      documentPath: DOC_PATH,
    }, 'wj://zz')

    expect(result).toBeNull()
  })

  it('legacy path 字段不应再作为当前文档路径回退来源', () => {
    const result = resourceFileUtil.resolveLocalResourcePath({
      path: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toBeNull()
  })
})

describe('resourceFileUtil.deleteLocalResource', () => {
  beforeEach(() => {
    pathExists.mockReset()
    remove.mockReset()
    stat.mockReset()
  })

  it('文件存在时，应该删除本地资源', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await resourceFileUtil.deleteLocalResource({
      documentPath: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: true,
      removed: true,
      reason: 'deleted',
      path: ASSET_PATH,
    })
    expect(pathExists).toHaveBeenCalledWith(ASSET_PATH)
    expect(stat).toHaveBeenCalledWith(ASSET_PATH)
    expect(remove).toHaveBeenCalledWith(ASSET_PATH)
  })

  it('文件不存在时，应该忽略删除并继续返回成功', async () => {
    pathExists.mockResolvedValue(false)

    const result = await resourceFileUtil.deleteLocalResource({
      documentPath: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: true,
      removed: false,
      reason: 'not-found',
      path: ASSET_PATH,
    })
    expect(pathExists).toHaveBeenCalledWith(ASSET_PATH)
    expect(stat).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('删除本地资源时，原始路径带 query 且真实文件存在时，应删除 fallback 对应的真实文件', async () => {
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === ASSET_TXT_PATH
    })
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await resourceFileUtil.deleteLocalResource({
      documentPath: DOC_PATH,
    }, {
      resourceUrl: convertResourceUrl('./assets/asset.txt?tab=1'),
      rawPath: './assets/asset.txt?tab=1',
    })

    expect(result).toEqual({
      ok: true,
      removed: true,
      reason: 'deleted',
      path: ASSET_TXT_PATH,
    })
    expect(pathExists).toHaveBeenNthCalledWith(1, `${ASSET_TXT_PATH}?tab=1`)
    expect(pathExists).toHaveBeenNthCalledWith(2, ASSET_TXT_PATH)
    expect(stat).toHaveBeenCalledWith(ASSET_TXT_PATH)
    expect(remove).toHaveBeenCalledWith(ASSET_TXT_PATH)
  })

  it('删除本地资源时，原始路径带 hash 且真实文件存在时，应删除 fallback 对应的真实文件', async () => {
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === ASSET_TXT_PATH
    })
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await resourceFileUtil.deleteLocalResource({
      documentPath: DOC_PATH,
    }, {
      resourceUrl: convertResourceUrl('./assets/asset.txt#anchor'),
      rawPath: './assets/asset.txt#anchor',
    })

    expect(result).toEqual({
      ok: true,
      removed: true,
      reason: 'deleted',
      path: ASSET_TXT_PATH,
    })
    expect(pathExists).toHaveBeenNthCalledWith(1, `${ASSET_TXT_PATH}#anchor`)
    expect(pathExists).toHaveBeenNthCalledWith(2, ASSET_TXT_PATH)
    expect(stat).toHaveBeenCalledWith(ASSET_TXT_PATH)
    expect(remove).toHaveBeenCalledWith(ASSET_TXT_PATH)
  })

  it('目标是目录时，应该拒绝删除', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
    })

    const result = await resourceFileUtil.deleteLocalResource({
      documentPath: DOC_PATH,
    }, 'wj://2e2f617373657473')

    expect(result).toEqual({
      ok: false,
      removed: false,
      reason: 'directory-not-allowed',
      path: ASSETS_DIR,
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('资源地址无法解析时，应该返回失败', async () => {
    const result = await resourceFileUtil.deleteLocalResource({
      documentPath: DOC_PATH,
    }, 'https://example.com/demo.png')

    expect(result).toEqual({
      ok: false,
      removed: false,
      reason: 'invalid-resource-url',
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('资源 payload 非法时，应该返回 invalid-resource-payload 且不抛错', async () => {
    const result = await resourceFileUtil.deleteLocalResource({
      documentPath: DOC_PATH,
    }, 'wj://zz')

    expect(result).toEqual({
      ok: false,
      removed: false,
      reason: 'invalid-resource-payload',
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('字面量 # 文件不存在但剥离 hash 后文件存在时，不应误删其他文件', async () => {
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === ASSET_DEMO_MD_PATH
    })

    const result = await resourceFileUtil.deleteLocalResource({
      documentPath: DOC_PATH,
    }, convertResourceUrl('./assets/demo%23guide.md'))

    expect(result).toEqual({
      ok: true,
      removed: false,
      reason: 'not-found',
      path: ASSET_DEMO_SHARP_GUIDE_PATH,
    })
    expect(pathExists).toHaveBeenCalledTimes(1)
    expect(pathExists).toHaveBeenCalledWith(ASSET_DEMO_SHARP_GUIDE_PATH)
    expect(stat).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('删除真实文件时如果文件系统抛错，应该标准化为 delete-failed 而不是把异常抛给调用方', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    remove.mockRejectedValue(new Error('permission denied'))

    const result = await resourceFileUtil.deleteLocalResource({
      documentPath: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: false,
      removed: false,
      reason: 'delete-failed',
      path: ASSET_PATH,
    })
  })
})

describe('resourceFileUtil.openLocalResourceInFolder', () => {
  beforeEach(() => {
    pathExists.mockReset()
    stat.mockReset()
  })

  it('文件不存在时，应该拒绝在资源管理器中打开', async () => {
    pathExists.mockResolvedValue(false)
    const showItemInFolder = vi.fn()

    const result = await resourceFileUtil.openLocalResourceInFolder({
      documentPath: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67', showItemInFolder)

    expect(result).toEqual({
      ok: true,
      opened: false,
      reason: 'not-found',
      path: ASSET_PATH,
    })
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('资源 payload 非法时，应该返回 invalid-resource-payload 且不抛错', async () => {
    const showItemInFolder = vi.fn()

    const result = await resourceFileUtil.openLocalResourceInFolder({
      documentPath: DOC_PATH,
    }, 'wj://zz', showItemInFolder)

    expect(result).toEqual({
      ok: false,
      opened: false,
      reason: 'invalid-resource-payload',
      path: null,
    })
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('打开本地资源时，原始路径带 query 且对应文件存在时，应打开真实文件所在位置', async () => {
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === DOCS_INDEX_HTML_PATH
    })
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    const showItemInFolder = vi.fn()

    const result = await resourceFileUtil.openLocalResourceInFolder({
      documentPath: DOC_PATH,
    }, {
      resourceUrl: convertResourceUrl('./docs/index.html?tab=a'),
      rawPath: './docs/index.html?tab=a',
    }, showItemInFolder)

    expect(result).toEqual({
      ok: true,
      opened: true,
      reason: 'opened',
      path: DOCS_INDEX_HTML_PATH,
    })
    expect(pathExists).toHaveBeenNthCalledWith(1, `${DOCS_INDEX_HTML_PATH}?tab=a`)
    expect(pathExists).toHaveBeenNthCalledWith(2, DOCS_INDEX_HTML_PATH)
    expect(showItemInFolder).toHaveBeenCalledWith(DOCS_INDEX_HTML_PATH)
  })

  it('打开本地资源时，原始路径带 hash 且对应文件存在时，应打开真实文件所在位置', async () => {
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === DOCS_INDEX_HTML_PATH
    })
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    const showItemInFolder = vi.fn()

    const result = await resourceFileUtil.openLocalResourceInFolder({
      documentPath: DOC_PATH,
    }, {
      resourceUrl: convertResourceUrl('./docs/index.html#guide'),
      rawPath: './docs/index.html#guide',
    }, showItemInFolder)

    expect(result).toEqual({
      ok: true,
      opened: true,
      reason: 'opened',
      path: DOCS_INDEX_HTML_PATH,
    })
    expect(pathExists).toHaveBeenNthCalledWith(1, `${DOCS_INDEX_HTML_PATH}#guide`)
    expect(pathExists).toHaveBeenNthCalledWith(2, DOCS_INDEX_HTML_PATH)
    expect(showItemInFolder).toHaveBeenCalledWith(DOCS_INDEX_HTML_PATH)
  })

  it('打开本地资源时，原始路径里的字面量 # 已存在，应优先打开完整文件路径', async () => {
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === ASSET_SHARP_MD_PATH
    })
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    const showItemInFolder = vi.fn()

    const result = await resourceFileUtil.openLocalResourceInFolder({
      documentPath: DOC_PATH,
    }, {
      resourceUrl: convertResourceUrl('./assets/a#b.md'),
      rawPath: './assets/a#b.md',
    }, showItemInFolder)

    expect(result).toEqual({
      ok: true,
      opened: true,
      reason: 'opened',
      path: ASSET_SHARP_MD_PATH,
    })
    expect(pathExists).toHaveBeenCalledTimes(1)
    expect(pathExists).toHaveBeenCalledWith(ASSET_SHARP_MD_PATH)
    expect(showItemInFolder).toHaveBeenCalledWith(ASSET_SHARP_MD_PATH)
  })

  it('打开本地资源时，字面量 %3F 文件不存在但去掉问号后文件存在时，不应误开其他文件', async () => {
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === ASSET_DEMO_MD_PATH
    })
    const showItemInFolder = vi.fn()

    const result = await resourceFileUtil.openLocalResourceInFolder({
      documentPath: DOC_PATH,
    }, {
      resourceUrl: convertResourceUrl('./assets/demo%3Fguide.md'),
      rawPath: './assets/demo%3Fguide.md',
    }, showItemInFolder)

    expect(result).toEqual({
      ok: true,
      opened: false,
      reason: 'not-found',
      path: ASSET_DEMO_QUESTION_GUIDE_PATH,
    })
    expect(pathExists).toHaveBeenCalledTimes(1)
    expect(pathExists).toHaveBeenCalledWith(ASSET_DEMO_QUESTION_GUIDE_PATH)
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('打开资源管理器时如果底层 showItemInFolder 抛错，应该标准化为 open-failed', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    const showItemInFolder = vi.fn(() => {
      throw new Error('shell failed')
    })

    const result = await resourceFileUtil.openLocalResourceInFolder({
      documentPath: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67', showItemInFolder)

    expect(result).toEqual({
      ok: false,
      opened: false,
      reason: 'open-failed',
      path: ASSET_PATH,
    })
  })
})

describe('resourceFileUtil.getLocalResourceInfo', () => {
  beforeEach(() => {
    pathExists.mockReset()
    stat.mockReset()
  })

  it('rawPath 是远程地址时，必须 fail-closed，不能继续回退到本地 resourceUrl', async () => {
    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: DOC_PATH,
    }, {
      rawPath: 'https://example.com/remote.png',
      resourceUrl: convertResourceUrl('./assets/local.png'),
    })

    expect(result).toEqual({
      ok: false,
      reason: 'invalid-resource-url',
      decodedPath: 'https://example.com/remote.png',
      exists: false,
      isDirectory: false,
      isFile: false,
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
  })

  it('rawPath 和 resourceUrl 同时可解析但目标不一致时，应该返回固定冲突错误', async () => {
    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: DOC_PATH,
    }, {
      rawPath: './assets/from-raw.png',
      resourceUrl: convertResourceUrl('./assets/from-url.png'),
    })

    expect(result).toEqual({
      ok: false,
      reason: 'resource-path-conflict',
      decodedPath: './assets/from-raw.png',
      exists: false,
      isDirectory: false,
      isFile: false,
      path: ASSET_FROM_RAW_PATH,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
  })

  it('documentPath 为 null 且 rawPath 是相对路径时，禁止回退到 resourceUrl', async () => {
    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: null,
    }, {
      rawPath: './assets/demo.png',
      resourceUrl: ABS_IMAGE_URL,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'relative-resource-without-document',
      decodedPath: './assets/demo.png',
      exists: false,
      isDirectory: false,
      isFile: false,
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
  })

  it('rawPath 与 resourceUrl 指向点段归一化后相同的绝对路径时，不应误判为冲突', async () => {
    pathExists.mockResolvedValue(false)

    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: DOC_PATH,
    }, {
      rawPath: toResourcePath(OUTSIDE_ASSET_PATH),
      resourceUrl: convertResourceUrl(POINT_SEGMENT_ASSET_PATH),
    })

    expect(result).toEqual({
      ok: true,
      reason: 'resolved',
      decodedPath: toResourcePath(OUTSIDE_ASSET_PATH),
      exists: false,
      isDirectory: false,
      isFile: false,
      path: OUTSIDE_ASSET_PATH,
    })
    expect(pathExists).toHaveBeenCalledWith(OUTSIDE_ASSET_PATH)
    expect(stat).not.toHaveBeenCalled()
  })

  it('文件存在时，应该返回文件资源信息', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: true,
      reason: 'resolved',
      decodedPath: './assets/demo.png',
      exists: true,
      isDirectory: false,
      isFile: true,
      path: ASSET_PATH,
    })
  })

  it('目录存在时，应该返回目录资源信息', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
    })

    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: DOC_PATH,
    }, 'wj://2e2f617373657473')

    expect(result).toEqual({
      ok: true,
      reason: 'resolved',
      decodedPath: './assets',
      exists: true,
      isDirectory: true,
      isFile: false,
      path: ASSETS_DIR,
    })
  })

  it('文件不存在时，也应该返回可解析路径', async () => {
    pathExists.mockResolvedValue(false)

    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: true,
      reason: 'resolved',
      decodedPath: './assets/demo.png',
      exists: false,
      isDirectory: false,
      isFile: false,
      path: ASSET_PATH,
    })
    expect(stat).not.toHaveBeenCalled()
  })

  it('资源 payload 非法时，应该返回 invalid-resource-payload 且不抛错', async () => {
    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: DOC_PATH,
    }, 'wj://zz')

    expect(result).toEqual({
      ok: false,
      reason: 'invalid-resource-payload',
      decodedPath: null,
      exists: false,
      isDirectory: false,
      isFile: false,
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
  })

  it('当前文件未保存且资源为相对路径时，应该返回 relative-resource-without-document', async () => {
    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: '',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: false,
      reason: 'relative-resource-without-document',
      decodedPath: './assets/demo.png',
      exists: false,
      isDirectory: false,
      isFile: false,
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
  })

  it('读取资源信息时如果 stat 抛错，应该标准化为 info-failed 而不是把异常抛给调用方', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockRejectedValue(new Error('stat failed'))

    const result = await resourceFileUtil.getLocalResourceInfo({
      documentPath: DOC_PATH,
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: false,
      reason: 'info-failed',
      decodedPath: './assets/demo.png',
      exists: false,
      isDirectory: false,
      isFile: false,
      path: ASSET_PATH,
    })
  })
})

describe('resourceFileUtil.getLocalResourceComparableKey', () => {
  beforeEach(() => {
    pathExistsSync.mockReset()
  })

  it('完整路径文件存在且文件名包含 # 时，应优先按完整路径生成比较 key', () => {
    pathExistsSync.mockImplementation(targetPath => targetPath === ASSET_SHARP_MD_PATH)

    const result = resourceFileUtil.getLocalResourceComparableKey({
      documentPath: DOC_PATH,
    }, './assets/a#b.md')

    expect(result).toBe(toComparableKey(ASSET_SHARP_MD_PATH))
  })

  it('完整路径不存在但去掉 hash 后的文件存在时，应按真实文件路径生成比较 key', () => {
    pathExistsSync.mockImplementation((targetPath) => {
      return targetPath === DOCS_INDEX_HTML_PATH
    })

    const result = resourceFileUtil.getLocalResourceComparableKey({
      documentPath: DOC_PATH,
    }, './docs/index.html#guide')

    expect(result).toBe(toComparableKey(DOCS_INDEX_HTML_PATH))
  })

  it('已保存文档中的普通相对路径即使文件不存在，也应返回可比较 key', () => {
    pathExistsSync.mockReturnValue(false)

    const result = resourceFileUtil.getLocalResourceComparableKey({
      documentPath: DOC_PATH,
    }, './assets/demo.png')

    expect(result).toBe(toComparableKey(ASSET_PATH))
  })

  it('绝对路径包含点段时，比较 key 应基于归一化后的真实路径', () => {
    pathExistsSync.mockReturnValue(false)

    const result = resourceFileUtil.getLocalResourceComparableKey({
      documentPath: DOC_PATH,
    }, POINT_SEGMENT_ASSET_PATH)

    expect(result).toBe(toComparableKey(OUTSIDE_ASSET_PATH))
  })

  it('未保存文档中的相对路径且包含 # 时，无法证明资源身份时应返回 null', () => {
    pathExistsSync.mockReturnValue(false)

    const result = resourceFileUtil.getLocalResourceComparableKey({
      documentPath: '',
    }, './docs/index.html#guide')

    expect(result).toBeNull()
  })
})
