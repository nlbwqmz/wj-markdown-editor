import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const { appMock } = vi.hoisted(() => ({
  appMock: {
    getAppPath: vi.fn(() => path.resolve('/app')),
    getPath: vi.fn(() => path.resolve('/userData')),
  },
}))

vi.mock('electron', () => ({ app: appMock }))

describe('resolveUserDataDir', () => {
  it('默认必须使用 app.getPath("userData") 下的 data 子目录', async () => {
    const { resolveUserDataDir } = await import('../userDataPathUtil.js')

    expect(resolveUserDataDir({ appApi: appMock, env: {} })).toBe(path.join(path.resolve('/userData'), 'data'))
    expect(appMock.getPath).toHaveBeenCalledWith('userData')
  })

  it('wJ_USER_DATA_IN_APP_DIR 必须让数据目录落在应用目录下的 data 子目录', async () => {
    const { resolveUserDataDir } = await import('../userDataPathUtil.js')

    expect(resolveUserDataDir({ appApi: appMock, env: { WJ_USER_DATA_IN_APP_DIR: '1' } }))
      .toBe(path.join(path.resolve('/app'), 'data'))
    expect(resolveUserDataDir({ appApi: appMock, env: { WJ_USER_DATA_IN_APP_DIR: 'true' } }))
      .toBe(path.join(path.resolve('/app'), 'data'))
  })

  it('wJ_USER_DATA_IN_APP_DIR 为 0/false/空白时必须视为关闭', async () => {
    const { resolveUserDataDir } = await import('../userDataPathUtil.js')

    expect(resolveUserDataDir({ appApi: appMock, env: { WJ_USER_DATA_IN_APP_DIR: '0' } }))
      .toBe(path.join(path.resolve('/userData'), 'data'))
    expect(resolveUserDataDir({ appApi: appMock, env: { WJ_USER_DATA_IN_APP_DIR: 'false' } }))
      .toBe(path.join(path.resolve('/userData'), 'data'))
    expect(resolveUserDataDir({ appApi: appMock, env: { WJ_USER_DATA_IN_APP_DIR: '  ' } }))
      .toBe(path.join(path.resolve('/userData'), 'data'))
  })

  it('wJ_USER_DATA_DIR 必须优先于 WJ_USER_DATA_IN_APP_DIR', async () => {
    const { resolveUserDataDir } = await import('../userDataPathUtil.js')

    expect(resolveUserDataDir({
      appApi: appMock,
      env: { WJ_USER_DATA_IN_APP_DIR: '1', WJ_USER_DATA_DIR: '/custom-data' },
    })).toBe(path.join(path.resolve('/custom-data'), 'data'))
  })

  it('环境变量 NODE_ENV 不再影响数据目录判定', async () => {
    const { resolveUserDataDir } = await import('../userDataPathUtil.js')

    expect(resolveUserDataDir({ appApi: appMock, env: { NODE_ENV: 'dev' } }))
      .toBe(path.join(path.resolve('/userData'), 'data'))
  })

  it('空白的路径覆盖值必须被忽略', async () => {
    const { resolveUserDataDir } = await import('../userDataPathUtil.js')

    expect(resolveUserDataDir({
      appApi: appMock,
      env: { WJ_USER_DATA_DIR: '   ' },
    })).toBe(path.join(path.resolve('/userData'), 'data'))
  })
})
