import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocumentCommandRunner } from '../documentCommandRunner.js'
import { createDocumentCommandService } from '../documentCommandService.js'
import { createDocumentEffectService } from '../documentEffectService.js'
import { createBoundFileSession, createDraftSession } from '../documentSessionFactory.js'
import { createDocumentSessionStore } from '../documentSessionStore.js'
import { createSaveCoordinator } from '../saveCoordinator.js'

const { writeFileMock } = vi.hoisted(() => {
  return {
    writeFileMock: vi.fn(),
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      readFile: vi.fn(async () => ''),
      pathExists: vi.fn(async () => true),
      stat: vi.fn(async () => ({ isFile: () => true })),
      writeFile: writeFileMock,
    },
  }
})

/**
 * 用真实的「命令服务 + 副作用服务 + runner」跑一遍关标签自动保存。
 *
 * 单测只验证命令层产出了哪些 effect，这里补齐另一半：
 * execute-save 真正回流 save.succeeded 之后，关标签链路必须真的落到 tabHostController.closeTab。
 */
function createRuntimeContext({
  autoSave = ['close-tab'],
  getSaveDialogTarget = () => null,
  withDraft = false,
  windowId = 1001,
} = {}) {
  const store = createDocumentSessionStore()
  const saveCoordinator = createSaveCoordinator()
  const config = { language: 'zh-CN', autoSave }
  const commandService = createDocumentCommandService({
    store,
    saveCoordinator,
    getConfig: () => config,
  })
  const effectService = createDocumentEffectService({
    getConfig: () => config,
    recentStore: {
      add: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
      get: () => [],
    },
  })

  const closedTabIds = []
  const prompted = []
  const failedMessages = []

  const runner = createDocumentCommandRunner({
    commandService,
    getSessionSnapshot: () => null,
    publishSnapshotChanged: () => null,
    applyEffect: ({ effect, dispatchCommand }) => {
      return effectService.applyEffect({
        effect,
        dispatchCommand,
        getSaveDialogTarget,
        closeHostController: {
          requestForceClose: vi.fn(),
          continueWindowClose: vi.fn(async () => true),
          finalizeWindowClose: vi.fn(),
          getClosedManualRequestCompletions: vi.fn(() => []),
        },
        showUnsavedPrompt: () => {
          prompted.push(effect)
          return null
        },
        showSaveFailedMessage: ({ content }) => {
          failedMessages.push(content)
          return null
        },
        externalWatchController: {
          start: vi.fn(async () => ({})),
          stop: vi.fn(async () => {}),
          getContext: vi.fn(() => ({
            bindingToken: null,
            watchingPath: null,
            shouldRebindAfterSave: false,
          })),
        },
        tabHostController: {
          closeTab: vi.fn(async (sessionId) => {
            closedTabIds.push(sessionId)
            return true
          }),
          closeTabs: vi.fn(async () => true),
          isSessionDirty: vi.fn(() => false),
        },
        windowMessageController: {
          publishWindowMessage: vi.fn(),
        },
        focusWindow: vi.fn(),
      })
    },
  })

  if (withDraft) {
    const draftSession = createDraftSession({
      sessionId: 'tab-draft',
      now: 1700000005003,
    })
    store.createSession(draftSession)
    store.bindWindowToSession({ windowId, sessionId: draftSession.sessionId })
    return {
      store,
      runner,
      windowId,
      targetSessionId: 'tab-draft',
      closedTabIds,
      prompted,
      failedMessages,
    }
  }

  const firstSession = createBoundFileSession({
    sessionId: 'tab-first',
    path: 'D:/docs/first.md',
    content: '# first',
    stat: null,
    now: 1700000005001,
  })
  const secondSession = createBoundFileSession({
    sessionId: 'tab-second',
    path: 'D:/docs/second.md',
    content: '# second',
    stat: null,
    now: 1700000005002,
  })
  store.createSession(firstSession)
  store.bindWindowToSession({ windowId, sessionId: firstSession.sessionId })
  store.createSession(secondSession)
  store.addSessionToWindow({ windowId, sessionId: secondSession.sessionId })

  return {
    store,
    runner,
    windowId,
    targetSessionId: 'tab-second',
    closedTabIds,
    prompted,
    failedMessages,
  }
}

describe('关标签自动保存（close-tab）端到端', () => {
  beforeEach(() => {
    writeFileMock.mockReset()
    writeFileMock.mockResolvedValue(undefined)
  })

  it('勾选后关闭脏标签：写盘 + 直接关标签，全程不弹确认框', async () => {
    const { runner, windowId, targetSessionId, closedTabIds, prompted } = createRuntimeContext()

    await runner.run({
      windowId,
      sessionId: targetSessionId,
      command: 'document.edit',
      payload: { content: '# second 已修改' },
    })

    await runner.run({
      windowId,
      command: 'document.close-tab',
      payload: { sessionId: targetSessionId, autoSave: true },
    })

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledWith('D:/docs/second.md', '# second 已修改')
    expect(closedTabIds).toEqual(['tab-second'])
    expect(prompted).toHaveLength(0)
  })

  it('未勾选时不写盘也不关标签，仍然弹确认框', async () => {
    const { runner, windowId, targetSessionId, closedTabIds, prompted } = createRuntimeContext({
      autoSave: ['close'],
    })

    await runner.run({
      windowId,
      sessionId: targetSessionId,
      command: 'document.edit',
      payload: { content: '# second 已修改' },
    })

    await runner.run({
      windowId,
      command: 'document.close-tab',
      payload: { sessionId: targetSessionId, autoSave: true },
    })

    expect(writeFileMock).not.toHaveBeenCalled()
    expect(closedTabIds).toEqual([])
    expect(prompted).toHaveLength(1)
  })

  it('写盘失败时不得关标签，并按自动保存文案提示', async () => {
    const { runner, windowId, targetSessionId, closedTabIds, prompted, failedMessages } = createRuntimeContext()
    writeFileMock.mockRejectedValueOnce(new Error('磁盘不可写'))

    await runner.run({
      windowId,
      sessionId: targetSessionId,
      command: 'document.edit',
      payload: { content: '# second 已修改' },
    })

    await runner.run({
      windowId,
      command: 'document.close-tab',
      payload: { sessionId: targetSessionId, autoSave: true },
    })

    expect(closedTabIds).toEqual([])
    expect(prompted).toHaveLength(1)
    expect(failedMessages.some(content => content.startsWith('自动保存失败'))).toBe(true)
  })

  it('未命名草稿选路径后必须写盘并关标签', async () => {
    const { runner, windowId, targetSessionId, closedTabIds, prompted } = createRuntimeContext({
      withDraft: true,
      getSaveDialogTarget: () => 'D:/docs/draft.md',
    })

    await runner.run({
      windowId,
      sessionId: targetSessionId,
      command: 'document.edit',
      payload: { content: '# 草稿内容' },
    })

    await runner.run({
      windowId,
      command: 'document.close-tab',
      payload: { sessionId: targetSessionId, autoSave: true },
    })

    expect(writeFileMock).toHaveBeenCalledWith('D:/docs/draft.md', '# 草稿内容')
    expect(closedTabIds).toEqual(['tab-draft'])
    expect(prompted).toHaveLength(0)
  })

  it('未命名草稿取消选路径时必须退回确认弹窗，草稿不得被静默丢弃', async () => {
    const { store, runner, windowId, targetSessionId, closedTabIds, prompted } = createRuntimeContext({
      withDraft: true,
      getSaveDialogTarget: () => null,
    })

    await runner.run({
      windowId,
      sessionId: targetSessionId,
      command: 'document.edit',
      payload: { content: '# 草稿内容' },
    })

    await runner.run({
      windowId,
      command: 'document.close-tab',
      payload: { sessionId: targetSessionId, autoSave: true },
    })

    expect(writeFileMock).not.toHaveBeenCalled()
    expect(closedTabIds).toEqual([])
    expect(prompted).toHaveLength(1)
    expect(store.getSession('tab-draft').documentSource.path).toBeNull()
  })
})
