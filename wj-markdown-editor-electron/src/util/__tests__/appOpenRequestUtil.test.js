import { describe, expect, it, vi } from 'vitest'
import {
  handleSecondInstanceOpenRequest,
  handleStartupOpenRequest,
  resolveSecondInstanceOpenTarget,
} from '../appOpenRequestUtil.js'

describe('appOpenRequestUtil', () => {
  it('startup 显式路径打开失败时，必须回退创建空白窗口，避免应用无窗口', async () => {
    const openDocumentPath = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'open-target-missing',
      path: 'D:/missing.md',
    })
    const createDraftWindow = vi.fn().mockResolvedValue(undefined)

    const result = await handleStartupOpenRequest({
      targetPath: 'D:/missing.md',
      openDocumentPath,
      createDraftWindow,
    })

    expect(openDocumentPath).toHaveBeenCalledWith('D:/missing.md', {
      trigger: 'startup',
    })
    expect(createDraftWindow).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ok: false,
      reason: 'open-target-missing',
      path: 'D:/missing.md',
    })
  })

  it('startup 显式路径打开成功时，不能再额外创建空白窗口', async () => {
    const openDocumentPath = vi.fn().mockResolvedValue({
      ok: true,
      reason: 'opened',
      path: 'D:/demo.md',
    })
    const createDraftWindow = vi.fn().mockResolvedValue(undefined)

    const result = await handleStartupOpenRequest({
      targetPath: 'D:/demo.md',
      openDocumentPath,
      createDraftWindow,
    })

    expect(createDraftWindow).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      reason: 'opened',
      path: 'D:/demo.md',
    })
  })

  it('startup 相对路径打开时，必须把 baseDir 一并透传给统一打开入口，保证路径绝对化语义稳定', async () => {
    const openDocumentPath = vi.fn().mockResolvedValue({
      ok: true,
      reason: 'opened',
      path: 'D:/workspace/docs/demo.md',
    })
    const createDraftWindow = vi.fn().mockResolvedValue(undefined)

    await handleStartupOpenRequest({
      targetPath: 'docs/demo.md',
      baseDir: 'D:/workspace',
      openDocumentPath,
      createDraftWindow,
    })

    expect(openDocumentPath).toHaveBeenCalledWith('docs/demo.md', {
      trigger: 'startup',
      baseDir: 'D:/workspace',
    })
    expect(createDraftWindow).not.toHaveBeenCalled()
  })

  it('second-instance 显式路径打开失败时，只能返回拒绝结果，不能偷偷创建新窗口', async () => {
    const openDocumentPath = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'open-target-not-file',
      path: 'D:/folder.md',
    })

    const result = await handleSecondInstanceOpenRequest({
      targetPath: 'D:/folder.md',
      openDocumentPath,
    })

    expect(openDocumentPath).toHaveBeenCalledWith('D:/folder.md', {
      trigger: 'second-instance',
    })
    expect(result).toEqual({
      ok: false,
      reason: 'open-target-not-file',
      path: 'D:/folder.md',
    })
  })

  it('second-instance 相对路径打开时，必须把 workingDirectory 透传给统一打开入口，避免首实例按错误 cwd 解析路径', async () => {
    const openDocumentPath = vi.fn().mockResolvedValue({
      ok: true,
      reason: 'opened',
      path: 'D:/workspace/docs/demo.md',
    })

    await handleSecondInstanceOpenRequest({
      targetPath: 'docs/demo.md',
      baseDir: 'D:/workspace',
      openDocumentPath,
    })

    expect(openDocumentPath).toHaveBeenCalledWith('docs/demo.md', {
      trigger: 'second-instance',
      baseDir: 'D:/workspace',
    })
  })
})

describe('resolveSecondInstanceOpenTarget', () => {
  it('additionalData 完好时，必须优先使用其 filePath 与 baseDir', () => {
    const result = resolveSecondInstanceOpenTarget({
      additionalData: { filePath: 'D:/docs/测试 文件.md', baseDir: 'D:/workspace' },
      commandLine: ['app.exe', 'D:/other.md'],
    })

    expect(result).toEqual({
      targetPath: 'D:/docs/测试 文件.md',
      baseDir: 'D:/workspace',
    })
  })

  it('additionalData 为 null（上游载荷损坏）时，必须回退 commandLine 中带空格的路径', () => {
    const result = resolveSecondInstanceOpenTarget({
      additionalData: null,
      commandLine: ['C:\\Program Files\\wj\\app.exe', 'D:\\docs\\测试 文件.md'],
    })

    expect(result).toEqual({
      targetPath: 'D:\\docs\\测试 文件.md',
      baseDir: null,
    })
  })

  it('commandLine 中路径后面跟随 Electron 附加开关时，仍必须命中 Markdown 路径', () => {
    const result = resolveSecondInstanceOpenTarget({
      additionalData: {},
      commandLine: ['app.exe', 'D:\\docs\\测试  文件.md', '--allow-file-access-from-files'],
    })

    expect(result).toEqual({
      targetPath: 'D:\\docs\\测试  文件.md',
      baseDir: null,
    })
  })

  it('additionalData.filePath 为空白字符串时，必须继续回退 commandLine', () => {
    const result = resolveSecondInstanceOpenTarget({
      additionalData: { filePath: '   ', baseDir: 'D:/workspace' },
      commandLine: ['app.exe', 'docs/demo.md'],
    })

    expect(result).toEqual({
      targetPath: 'docs/demo.md',
      baseDir: null,
    })
  })

  it('additionalData 只有 filePath 时，baseDir 必须为 null，交由 workingDirectory 兜底', () => {
    const result = resolveSecondInstanceOpenTarget({
      additionalData: { filePath: 'D:/demo.md' },
      commandLine: [],
    })

    expect(result).toEqual({
      targetPath: 'D:/demo.md',
      baseDir: null,
    })
  })

  it('两个来源都没有 Markdown 目标时，必须返回 null，交回聚焦已有窗口的默认行为', () => {
    expect(resolveSecondInstanceOpenTarget({
      additionalData: null,
      commandLine: ['app.exe', '--allow-file-access-from-files'],
    })).toBeNull()
    expect(resolveSecondInstanceOpenTarget({
      additionalData: null,
      commandLine: undefined,
    })).toBeNull()
  })
})
