import { describe, expect, it, vi } from 'vitest'

import { createDocumentCommandRunner } from '../documentCommandRunner.js'

describe('documentCommandRunner', () => {
  it('必须按 dispatch -> publish-snapshot -> apply-effects 的顺序执行', async () => {
    const events = []
    const commandService = {
      dispatch: vi.fn(() => {
        events.push('dispatch')
        return {
          snapshot: {
            sessionId: 'session-1',
            content: '# 内容',
          },
          effects: [
            { type: 'effect-a' },
            { type: 'effect-b' },
          ],
        }
      }),
    }
    const runner = createDocumentCommandRunner({
      commandService,
      getSessionSnapshot: vi.fn(() => null),
      publishSnapshotChanged: vi.fn(() => {
        events.push('publish-snapshot')
      }),
      applyEffect: vi.fn(async ({ effect }) => {
        events.push(`apply:${effect.type}`)
      }),
    })

    const result = await runner.run({
      windowId: 1,
      command: 'document.save',
    })

    expect(result.snapshot).toEqual({
      sessionId: 'session-1',
      content: '# 内容',
    })
    expect(events).toEqual([
      'dispatch',
      'publish-snapshot',
      'apply:effect-a',
      'apply:effect-b',
    ])
  })

  it('publishSnapshotMode=if-changed 且快照未变化时，不应重复广播 snapshot', async () => {
    const unchangedSnapshot = {
      sessionId: 'session-1',
      content: '# 内容',
    }
    const publishSnapshotChanged = vi.fn()
    const applyEffect = vi.fn()
    const runner = createDocumentCommandRunner({
      commandService: {
        dispatch: vi.fn(() => {
          return {
            snapshot: unchangedSnapshot,
            effects: [
              { type: 'effect-a' },
            ],
          }
        }),
      },
      getSessionSnapshot: vi.fn(() => unchangedSnapshot),
      publishSnapshotChanged,
      applyEffect,
    })

    await runner.run({
      windowId: 2,
      command: 'window.blur',
      publishSnapshotMode: 'if-changed',
    })

    expect(publishSnapshotChanged).not.toHaveBeenCalled()
    expect(applyEffect).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 2,
      effect: {
        type: 'effect-a',
      },
    }))
  })
})
