import { describe, expect, it } from 'vitest'
import * as windowRegistryModule from '../windowRegistry.js'

const { createWindowRegistry } = windowRegistryModule

describe('windowRegistry', () => {
  it('模块级导出面必须只保留 createWindowRegistry，不能额外挂兼容出口', () => {
    expect(Object.keys(windowRegistryModule).sort()).toEqual([
      'createWindowRegistry',
    ])
    expect('default' in windowRegistryModule).toBe(false)
  })

  it('公开 API 只能暴露窗口映射能力，不能回退出 winInfo 风格兼容出口', () => {
    const registry = createWindowRegistry()

    expect(Object.keys(registry).sort()).toEqual([
      'bindSession',
      'getAllWindows',
      'getSessionIdByWindowId',
      'getWindowById',
      'registerWindow',
      'unregisterWindow',
    ])
    expect('getWinInfo' in registry).toBe(false)
    expect('getByWebContentsId' in registry).toBe(false)
    expect('updateTempContent' in registry).toBe(false)
    expect('handleExternalChange' in registry).toBe(false)
    expect('getDocumentContext' in registry).toBe(false)
    expect('registerWindowState' in registry).toBe(false)
    expect('getWindowState' in registry).toBe(false)
    expect('findWindowStateByWin' in registry).toBe(false)
  })

  it('registerWindow / bindSession / unregisterWindow 应维护稳定映射', () => {
    const registry = createWindowRegistry()
    const firstWin = { name: 'first-window' }
    const secondWin = { name: 'second-window' }

    registry.registerWindow({
      windowId: 1001,
      win: firstWin,
    })
    registry.registerWindow({
      windowId: 1002,
      win: secondWin,
    })
    registry.bindSession({
      windowId: 1001,
      sessionId: 'session-1',
    })

    expect(registry.getWindowById(1001)).toBe(firstWin)
    expect(registry.getSessionIdByWindowId(1001)).toBe('session-1')
    expect(registry.getAllWindows()).toEqual([firstWin, secondWin])
  })

  it('unregisterWindow 后必须同时清理窗口引用和 session 绑定', () => {
    const registry = createWindowRegistry()
    const win = { name: 'bound-window' }

    registry.registerWindow({
      windowId: 1001,
      win,
    })
    registry.bindSession({
      windowId: 1001,
      sessionId: 'session-1',
    })

    registry.unregisterWindow(1001)

    expect(registry.getWindowById(1001)).toBeNull()
    expect(registry.getSessionIdByWindowId(1001)).toBeNull()
    expect(registry.getAllWindows()).toEqual([])
  })

  it('bindSession 绑定未注册窗口时应明确失败，避免脱离窗口真相单独存活', () => {
    const registry = createWindowRegistry()

    expect(() => {
      registry.bindSession({
        windowId: 1001,
        sessionId: 'session-1',
      })
    }).toThrow(/windowId/i)
  })

  it('registerWindow 不应允许重复注册同一个 windowId，避免新窗口无声继承旧 session 绑定', () => {
    const registry = createWindowRegistry()

    registry.registerWindow({
      windowId: 1001,
      win: { name: 'first-window' },
    })
    registry.bindSession({
      windowId: 1001,
      sessionId: 'session-1',
    })

    expect(() => {
      registry.registerWindow({
        windowId: 1001,
        win: { name: 'replacement-window' },
      })
    }).toThrow(/windowId/i)
    expect(registry.getSessionIdByWindowId(1001)).toBe('session-1')
  })

  it('registerWindow 不应允许同一个 win 被不同 windowId 重复注册，避免广播重复命中同一窗口', () => {
    const registry = createWindowRegistry()
    const sharedWin = { name: 'shared-window' }

    registry.registerWindow({
      windowId: 1001,
      win: sharedWin,
    })

    expect(() => {
      registry.registerWindow({
        windowId: 1002,
        win: sharedWin,
      })
    }).toThrow(/win/i)
    expect(registry.getAllWindows()).toEqual([sharedWin])
  })

  it('数字和字符串形式的同一 windowId 必须命中同一映射，避免协议链路与窗口链路分裂', () => {
    const registry = createWindowRegistry()
    const win = { name: 'main-window' }

    registry.registerWindow({
      windowId: 1001,
      win,
    })
    registry.bindSession({
      windowId: '1001',
      sessionId: 'session-1',
    })

    expect(registry.getWindowById('1001')).toBe(win)
    expect(registry.getSessionIdByWindowId(1001)).toBe('session-1')
    expect(() => {
      registry.registerWindow({
        windowId: '1001',
        win: { name: 'duplicated-window' },
      })
    }).toThrow(/windowId/i)
  })
})
