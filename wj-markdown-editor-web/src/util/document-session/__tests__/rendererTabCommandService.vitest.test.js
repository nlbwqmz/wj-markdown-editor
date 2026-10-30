import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockedStore, commandMock, preparationMock } = vi.hoisted(() => ({
  mockedStore: {
    config: { autoSave: [] },
    documentSessionSnapshot: null,
  },
  commandMock: {
    requestDocumentActivateTab: vi.fn(),
    requestDocumentCloseTab: vi.fn(),
    requestDocumentSessionSnapshot: vi.fn(),
  },
  preparationMock: vi.fn(),
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore: () => mockedStore,
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => commandMock)

vi.mock('@/util/document-session/currentWindowOpenPreparationService.js', () => ({
  requestCurrentWindowOpenPreparation: preparationMock,
}))

/**
 * 渲染层看到的窗口快照。
 *
 * 注意：多个用例刻意让这份快照“停留在旧值”，用来证明键盘链路不依赖广播时序。
 */
function createSnapshot({ sessionIdList, activeSessionId }, extra = {}) {
  return {
    tabs: sessionIdList.map(sessionId => ({ sessionId })),
    activeSessionId,
    ...extra,
  }
}

function setStoreSnapshot(state, extra) {
  mockedStore.documentSessionSnapshot = createSnapshot(state, extra)
}

/**
 * 模拟主进程真相。
 *
 * 命令被调用时才改 workspace，渲染层快照不会同步更新：
 * 真实链路里“广播有没有先落地”没有契约保证，这里把它固定成“不会先落地”。
 */
let workspace = { sessionIdList: [], activeSessionId: null }

function installCommandMocks(initialState) {
  workspace = {
    sessionIdList: [...initialState.sessionIdList],
    activeSessionId: initialState.activeSessionId,
  }

  commandMock.requestDocumentActivateTab.mockImplementation(async (sessionId) => {
    workspace = { ...workspace, activeSessionId: sessionId }
    return { snapshot: createSnapshot(workspace) }
  })

  commandMock.requestDocumentCloseTab.mockImplementation(async (sessionId) => {
    const nextSessionIdList = workspace.sessionIdList.filter(item => item !== sessionId)
    workspace = {
      sessionIdList: nextSessionIdList,
      activeSessionId: nextSessionIdList[0] ?? null,
    }
    return { snapshot: createSnapshot(workspace) }
  })

  commandMock.requestDocumentSessionSnapshot.mockImplementation(async () => createSnapshot(workspace))
}

/**
 * 排空队列。
 *
 * 队列全程没有定时器，只需要把微任务链跑完；末尾补一次 macrotask，
 * 保证“结算后再重新调度”的那一跳也被执行到。
 */
async function settleQueue() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
  await new Promise(resolve => setTimeout(resolve, 0))
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
}

let service

beforeEach(async () => {
  vi.resetModules()
  mockedStore.config = { autoSave: [] }
  mockedStore.documentSessionSnapshot = null
  commandMock.requestDocumentActivateTab.mockReset()
  commandMock.requestDocumentCloseTab.mockReset()
  commandMock.requestDocumentSessionSnapshot.mockReset()
  preparationMock.mockReset()
  preparationMock.mockResolvedValue({ ok: true })
  service = await import('../rendererTabCommandService.js')
})

describe('rendererTabCommandService 切换', () => {
  it('连按 5 次“下一个”必须合并成一条命令，并一次走到第 5 个标签', async () => {
    const state = { sessionIdList: ['s1', 's2', 's3', 's4', 's5', 's6'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)

    for (let i = 0; i < 5; i++) {
      service.requestSwitchStep('next')
    }
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).toHaveBeenCalledTimes(1)
    expect(commandMock.requestDocumentActivateTab).toHaveBeenLastCalledWith('s6', { autoSave: true })
  })

  it('后续连按必须以上一次命令回包为基线，不能依赖渲染层快照刷新', async () => {
    const state = { sessionIdList: ['s1', 's2', 's3', 's4', 's5', 's6'], activeSessionId: 's1' }
    // 渲染层快照始终停在 s1：如果实现读了它，第二轮会算出 s4。
    setStoreSnapshot(state)
    installCommandMocks(state)

    for (let i = 0; i < 5; i++) {
      service.requestSwitchStep('next')
    }
    await settleQueue()

    for (let i = 0; i < 3; i++) {
      service.requestSwitchStep('next')
    }
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).toHaveBeenCalledTimes(2)
    // 从 s6 再走 3 格 → s3（6 个标签环绕）
    expect(commandMock.requestDocumentActivateTab).toHaveBeenLastCalledWith('s3', { autoSave: true })
  })

  it('相反方向的连按必须相互抵消后只发一条命令', async () => {
    const state = { sessionIdList: ['s1', 's2', 's3', 's4', 's5', 's6'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)

    for (let i = 0; i < 5; i++) {
      service.requestSwitchStep('next')
    }
    service.requestSwitchStep('previous')
    service.requestSwitchStep('previous')
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).toHaveBeenCalledTimes(1)
    expect(commandMock.requestDocumentActivateTab).toHaveBeenLastCalledWith('s4', { autoSave: true })
  })

  it('只有一个标签时切换必须不发送命令', async () => {
    const state = { sessionIdList: ['s1'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)

    service.requestSwitchStep('next')
    service.requestSwitchStep('previous')
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).not.toHaveBeenCalled()
  })

  it('切换命令被拒绝时必须只结束当前一步，后续按键仍能生效', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    commandMock.requestDocumentActivateTab.mockRejectedValueOnce(new Error('reject'))

    service.requestSwitchStep('next')
    await settleQueue()
    expect(commandMock.requestDocumentActivateTab).toHaveBeenCalledTimes(1)

    service.requestSwitchStep('next')
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).toHaveBeenCalledTimes(2)
    expect(commandMock.requestDocumentActivateTab).toHaveBeenLastCalledWith('s2', { autoSave: true })
  })
})

describe('rendererTabCommandService 切换时自动保存', () => {
  it('开启切换时自动保存时必须先收敛正文', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    mockedStore.config = { autoSave: ['switch'] }

    service.requestSwitchStep('next')
    await settleQueue()

    expect(preparationMock).toHaveBeenCalledTimes(1)
    expect(commandMock.requestDocumentActivateTab).toHaveBeenLastCalledWith('s2', { autoSave: true })
  })

  it('正文收敛失败时必须传 autoSave: false，避免拿旧内容写盘', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    mockedStore.config = { autoSave: ['switch'] }
    preparationMock.mockResolvedValueOnce({ ok: false, reason: 'preparation-unavailable' })

    service.requestSwitchStep('next')
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).toHaveBeenLastCalledWith('s2', { autoSave: false })
  })

  it('未开启切换时自动保存时不得发起正文收敛', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    mockedStore.config = { autoSave: [] }

    service.requestSwitchStep('next')
    await settleQueue()

    expect(preparationMock).not.toHaveBeenCalled()
  })
})

describe('rendererTabCommandService 关闭标签页时自动保存', () => {
  it('开启关闭标签页时自动保存时必须先收敛正文', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    mockedStore.config = { autoSave: ['close-tab'] }

    await service.closeTabById('s1')

    expect(preparationMock).toHaveBeenCalledTimes(1)
    expect(commandMock.requestDocumentCloseTab).toHaveBeenCalledWith('s1', { autoSave: true })
  })

  it('正文收敛失败时必须传 autoSave: false，避免拿旧内容写盘', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    mockedStore.config = { autoSave: ['close-tab'] }
    preparationMock.mockResolvedValueOnce({ ok: false, reason: 'preparation-unavailable' })

    await service.closeTabById('s1')

    expect(commandMock.requestDocumentCloseTab).toHaveBeenCalledWith('s1', { autoSave: false })
  })

  it('关闭后台标签时同样必须收敛正文，不能按活动标签分流', async () => {
    // 与切换侧刻意不同：关后台脏标签时主进程会先把它激活，编辑器随之换页，
    // 这时不收敛反而会把活动标签最后一次输入一起丢掉，所以这里一律收敛。
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    mockedStore.config = { autoSave: ['close-tab'] }

    await service.closeTabById('s2')

    expect(preparationMock).toHaveBeenCalledTimes(1)
    expect(commandMock.requestDocumentCloseTab).toHaveBeenCalledWith('s2', { autoSave: true })
  })

  it('未开启关闭标签页时自动保存时不得发起正文收敛', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    mockedStore.config = { autoSave: ['close'] }

    await service.closeTabById('s1')

    expect(preparationMock).not.toHaveBeenCalled()
    expect(commandMock.requestDocumentCloseTab).toHaveBeenCalledWith('s1', { autoSave: true })
  })

  it('快捷键关闭也必须走同一条正文收敛，不能绕过 closeTabById', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    mockedStore.config = { autoSave: ['close-tab'] }

    service.requestCloseTab()
    await settleQueue()

    expect(preparationMock).toHaveBeenCalledTimes(1)
    expect(commandMock.requestDocumentCloseTab).toHaveBeenCalledWith('s1', { autoSave: true })
  })
})

describe('rendererTabCommandService 关闭', () => {
  it('切换后立刻关闭必须关掉切换后的标签，而不是切换前的', async () => {
    const state = { sessionIdList: ['s1', 's2', 's3'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)

    service.requestSwitchStep('next')
    service.requestCloseTab()
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).toHaveBeenLastCalledWith('s2', { autoSave: true })
    expect(commandMock.requestDocumentCloseTab).toHaveBeenCalledWith('s2', { autoSave: true })
  })

  it('同一帧连按 5 次关闭时必须受积压上限约束，不做全量排队', async () => {
    const state = { sessionIdList: ['s1', 's2', 's3', 's4', 's5', 's6'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)

    for (let i = 0; i < 5; i++) {
      service.requestCloseTab()
    }
    await settleQueue()

    // 上限 2 表示“1 条在执行 + 最多 2 条积压”，同一帧内只会关掉 2 个。
    expect(commandMock.requestDocumentCloseTab.mock.calls.map(call => call[0])).toEqual(['s1', 's2'])
    expect(workspace.activeSessionId).toBe('s3')
  })

  it('有间隔的连续关闭必须逐个生效', async () => {
    const state = { sessionIdList: ['s1', 's2', 's3'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)

    for (let i = 0; i < 3; i++) {
      service.requestCloseTab()
      await settleQueue()
    }

    expect(commandMock.requestDocumentCloseTab.mock.calls.map(call => call[0])).toEqual(['s1', 's2', 's3'])
  })

  it('一轮连按中若关闭没有真正完成，剩余关闭意图必须被丢弃', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    // 脏标签：主进程只弹确认，不销毁会话
    commandMock.requestDocumentCloseTab.mockImplementation(async () => {
      setStoreSnapshot(state, { closePrompt: { visible: true } })
      return { snapshot: createSnapshot(state) }
    })

    for (let i = 0; i < 3; i++) {
      service.requestCloseTab()
    }
    await settleQueue()

    // 第一次发命令并弹确认；后续意图被丢弃，不能顺手把下一个标签也关掉
    expect(commandMock.requestDocumentCloseTab).toHaveBeenCalledTimes(1)
    expect(workspace.sessionIdList).toEqual(['s1', 's2'])
  })

  it('脏标签关闭后取消确认框，再次按关闭必须能重新关闭同一个标签', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    commandMock.requestDocumentCloseTab.mockImplementationOnce(async () => {
      setStoreSnapshot(state, { closePrompt: { visible: true } })
      return { snapshot: createSnapshot(state) }
    })

    service.requestCloseTab()
    await settleQueue()
    expect(commandMock.requestDocumentCloseTab).toHaveBeenCalledTimes(1)

    // 用户点了“取消”：弹窗消失，标签仍在
    setStoreSnapshot(state)
    service.requestCloseTab()
    await settleQueue()

    expect(commandMock.requestDocumentCloseTab).toHaveBeenCalledTimes(2)
    expect(commandMock.requestDocumentCloseTab).toHaveBeenLastCalledWith('s1', { autoSave: true })
  })

  it('没有活动标签时关闭必须不发送命令', async () => {
    const state = { sessionIdList: [], activeSessionId: null }
    setStoreSnapshot(state)
    installCommandMocks(state)

    service.requestCloseTab()
    await settleQueue()

    expect(commandMock.requestDocumentCloseTab).not.toHaveBeenCalled()
  })
})

describe('rendererTabCommandService 待决弹窗守卫', () => {
  it('关闭确认弹窗可见时三个入口都必须不发送命令', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state, { closePrompt: { visible: true } })
    installCommandMocks(state)

    service.requestSwitchStep('next')
    service.requestCloseTab()
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).not.toHaveBeenCalled()
    expect(commandMock.requestDocumentCloseTab).not.toHaveBeenCalled()
  })

  it('外部变更弹窗可见时三个入口都必须不发送命令', async () => {
    const state = { sessionIdList: ['s1', 's2'], activeSessionId: 's1' }
    setStoreSnapshot(state, { externalPrompt: { visible: true } })
    installCommandMocks(state)

    service.requestSwitchStep('next')
    service.requestCloseTab()
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).not.toHaveBeenCalled()
    expect(commandMock.requestDocumentCloseTab).not.toHaveBeenCalled()
  })

  it('弹窗出现前累积的位移必须被清空，不能在弹窗消失后突然生效', async () => {
    const state = { sessionIdList: ['s1', 's2', 's3'], activeSessionId: 's1' }
    setStoreSnapshot(state)
    installCommandMocks(state)
    // 第一步执行期间弹窗出现（模拟脏标签确认框 / 外部变更提示）
    commandMock.requestDocumentActivateTab.mockImplementationOnce(async (sessionId) => {
      workspace = { ...workspace, activeSessionId: sessionId }
      setStoreSnapshot(workspace, { closePrompt: { visible: true } })
      return { snapshot: createSnapshot(workspace) }
    })

    service.requestSwitchStep('next')
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).toHaveBeenCalledTimes(1)
    expect(commandMock.requestDocumentActivateTab).toHaveBeenLastCalledWith('s2', { autoSave: true })

    // 弹窗存续期间的按键全部被丢弃
    service.requestSwitchStep('next')
    service.requestSwitchStep('next')
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).toHaveBeenCalledTimes(1)

    // 弹窗消失后用户再按一次：只能往前走一格，不能把之前累积的位移一起补上
    setStoreSnapshot(workspace)
    service.requestSwitchStep('next')
    await settleQueue()

    expect(commandMock.requestDocumentActivateTab).toHaveBeenCalledTimes(2)
    expect(commandMock.requestDocumentActivateTab).toHaveBeenLastCalledWith('s3', { autoSave: true })
  })
})
