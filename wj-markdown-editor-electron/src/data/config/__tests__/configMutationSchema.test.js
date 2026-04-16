import { describe, expect, it } from 'vitest'
import { validateConfigMutationRequest } from '../configMutationSchema.js'

describe('validateConfigMutationRequest', () => {
  it('拒绝空 operations', () => {
    expect(() => validateConfigMutationRequest({
      operations: [],
    })).toThrow(/operations/)
  })

  it('允许白名单 set 路径', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['theme', 'global'], value: 'dark' },
      ],
    })).not.toThrow()
  })

  it('允许固定下标 set 路径', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['watermark', 'gap', 0], value: 180 },
      ],
    })).not.toThrow()
  })

  it.each([
    [['editorExtension', 'lineNumbers'], false],
    [['editorExtension', 'lineWrapping'], false],
    [['editorExtension', 'highlightActiveLine'], false],
    [['editorExtension', 'highlightSelectionMatches'], false],
    [['editorExtension', 'bracketMatching'], false],
    [['editorExtension', 'closeBrackets'], false],
    [['imageBed', 'uploader'], 'smms'],
    [['imageBed', 'smms', 'token'], 'token'],
    [['imageBed', 'smms', 'backupDomain'], 'smms.app'],
    [['imageBed', 'github', 'repo'], 'owner/repo'],
    [['imageBed', 'github', 'token'], 'github-token'],
    [['imageBed', 'github', 'path'], 'img/'],
    [['imageBed', 'github', 'branch'], 'main'],
    [['imageBed', 'github', 'customUrl'], 'https://cdn.example.com'],
  ])('允许设置页现有可写字段 %j 走 set mutation', (path, value) => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path, value },
      ],
    })).not.toThrow()
  })

  it('拒绝未知路径', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['theme', 'unknown'], value: true },
      ],
    })).toThrow(/未知配置更新路径/)
  })

  it('拒绝 shortcutKeyList 下标写法', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['shortcutKeyList', 0, 'enabled'], value: false },
      ],
    })).toThrow(/shortcutKeyList 仅允许按 id 更新/)
  })

  it('拒绝未知快捷键字段', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'setShortcutKeyField', id: 'save', field: 'name', value: '保存文件' },
      ],
    })).toThrow(/快捷键字段仅允许/)
  })

  it('拒绝未知自动保存选项', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'setAutoSaveOption', option: 'interval', enabled: true },
      ],
    })).toThrow(/自动保存选项仅允许/)
  })

  it('拒绝未知操作类型', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'delete', path: ['theme', 'global'] },
      ],
    })).toThrow(/未知配置更新操作类型/)
  })

  it('拒绝 reset 与其他操作混用', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'reset' },
        { type: 'set', path: ['theme', 'global'], value: 'dark' },
      ],
    })).toThrow(/reset 操作必须单独提交/)
  })
})
