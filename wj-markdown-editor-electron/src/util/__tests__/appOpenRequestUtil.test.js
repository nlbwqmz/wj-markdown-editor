import { describe, expect, it, vi } from 'vitest'
import {
  handleSecondInstanceOpenRequest,
  handleStartupOpenRequest,
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
