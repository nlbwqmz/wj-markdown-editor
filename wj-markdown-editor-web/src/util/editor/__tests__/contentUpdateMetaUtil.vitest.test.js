import { describe, expect, it } from 'vitest'
import { isContentSyncTargetMismatch } from '../contentUpdateMetaUtil.js'

/**
 * 视图与会话错配的保护。
 *
 * 背景：新建标签时目标容器要晚一帧才挂载，此刻编辑器里仍是上一个标签的 view。
 * 若把新文档的正文（空草稿的 `''`）按“活动视图”回写，旧标签的内容会被静默清空；
 * 关闭标签前的正文收敛随后会把这个空内容写进磁盘。
 */
describe('isContentSyncTargetMismatch', () => {
  it('快照目标会话与当前视图会话一致时必须允许回写', () => {
    expect(isContentSyncTargetMismatch({
      snapshotSessionId: 'session-a',
      viewSessionId: 'session-a',
    })).toBe(false)
  })

  it('目标会话与当前视图会话不一致时必须跳过回写', () => {
    // 这正是 bug 的形态：快照说目标是新草稿，屏幕上的 view 还是旧文档的。
    expect(isContentSyncTargetMismatch({
      snapshotSessionId: 'session-draft',
      viewSessionId: 'session-a',
    })).toBe(true)
  })

  it('任一侧身份缺失时不做判断，保持旧行为', () => {
    expect(isContentSyncTargetMismatch({ snapshotSessionId: null, viewSessionId: 'session-a' })).toBe(false)
    expect(isContentSyncTargetMismatch({ snapshotSessionId: 'session-a', viewSessionId: null })).toBe(false)
    expect(isContentSyncTargetMismatch()).toBe(false)
  })
})
