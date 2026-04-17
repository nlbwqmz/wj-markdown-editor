import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveFileManagerEntryExtension,
  resolveFileManagerEntryIconProfile,
  resolveFileManagerEntryType,
  resolveFileManagerEntryTypeWeight,
  sortFileManagerEntryList,
} from '../fileManagerEntryMetaUtil.js'

function createEntry({
  name,
  path,
  kind,
  type,
  isDirectory,
  modifiedTimeMs,
} = {}) {
  return {
    name,
    path,
    kind,
    type,
    isDirectory,
    modifiedTimeMs,
  }
}

describe('fileManagerEntryMetaUtil', () => {
  it('应优先从名称或路径中解析扩展名，并统一转为小写', () => {
    expect(resolveFileManagerEntryExtension(createEntry({
      name: 'README.MD',
    }))).toBe('md')
    expect(resolveFileManagerEntryExtension(createEntry({
      path: 'D:/docs/assets/Cover.PNG?version=1',
    }))).toBe('png')
    expect(resolveFileManagerEntryExtension(createEntry({
      name: '.gitignore',
    }))).toBe('')
  })

  it('应兼容 controller 归一化条目与 Electron 原始条目，识别 markdown、image 与 other', () => {
    expect(resolveFileManagerEntryType(createEntry({
      name: 'draft.md',
      kind: 'other',
    }))).toBe('markdown')
    expect(resolveFileManagerEntryType(createEntry({
      name: 'cover.PNG',
      kind: 'file',
    }))).toBe('image')
    expect(resolveFileManagerEntryType(createEntry({
      path: 'D:/docs/archive.bin',
      kind: 'file',
    }))).toBe('other')
  })

  it('应为代表性条目返回可复用的图标 profile', () => {
    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'assets',
      kind: 'directory',
    }))).toEqual({
      iconClass: 'i-tabler:folder',
      testId: 'file-manager-entry-icon-directory',
    })
    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'report.pdf',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-pdf',
      testId: 'file-manager-entry-icon-pdf',
    })
  })

  it('应为常见开发与办公文件返回更细化的图标 profile，同时不改变原有类型识别', () => {
    expect(resolveFileManagerEntryType(createEntry({
      name: 'slides.pptx',
      kind: 'file',
    }))).toBe('other')
    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'slides.pptx',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-ppt',
      testId: 'file-manager-entry-icon-presentation',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'server.log',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-txt',
      testId: 'file-manager-entry-icon-text',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'config.json',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:braces',
      testId: 'file-manager-entry-icon-json',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'schema.xml',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-xml',
      testId: 'file-manager-entry-icon-xml',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'main.ts',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-ts',
      testId: 'file-manager-entry-icon-typescript',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'index.html',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-html',
      testId: 'file-manager-entry-icon-html',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'style.scss',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-css',
      testId: 'file-manager-entry-icon-css',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'App.vue',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-vue',
      testId: 'file-manager-entry-icon-vue',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'main.py',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:brand-python',
      testId: 'file-manager-entry-icon-python',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'Service.java',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-code',
      testId: 'file-manager-entry-icon-java',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'native.cpp',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:brand-cpp',
      testId: 'file-manager-entry-icon-cpp',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'server.go',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:brand-golang',
      testId: 'file-manager-entry-icon-go',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'main.rs',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-rs',
      testId: 'file-manager-entry-icon-rust',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'query.sql',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:file-type-sql',
      testId: 'file-manager-entry-icon-sql',
    })

    expect(resolveFileManagerEntryIconProfile(createEntry({
      name: 'setup.exe',
      kind: 'file',
    }))).toEqual({
      iconClass: 'i-tabler:binary',
      testId: 'file-manager-entry-icon-executable',
    })
  })

  it('文件管理面板动态返回的图标类应通过 @unocss-include 进入 UnoCSS 提取，而不是依赖 safelist', async () => {
    const unoConfigModule = await import('../../../../uno.config.js')
    const unoConfig = unoConfigModule.default ?? {}
    const source = await readFile(path.resolve(process.cwd(), 'src/util/file-manager/fileManagerEntryMetaUtil.js'), 'utf8')

    expect(Array.isArray(unoConfig.safelist) ? unoConfig.safelist : []).toEqual([])
    expect(source).toContain('// @unocss-include')
  })

  it('type 权重应遵循业务类型顺序，并把未知类型归到 other', () => {
    expect(resolveFileManagerEntryTypeWeight('directory')).toBeLessThan(resolveFileManagerEntryTypeWeight('markdown'))
    expect(resolveFileManagerEntryTypeWeight('markdown')).toBeLessThan(resolveFileManagerEntryTypeWeight('image'))
    expect(resolveFileManagerEntryTypeWeight('audio')).toBeLessThan(resolveFileManagerEntryTypeWeight('other'))
    expect(resolveFileManagerEntryTypeWeight('unknown')).toBe(resolveFileManagerEntryTypeWeight('other'))
  })

  it('name 排序应使用中文本地化比较，并保持目录始终在前', () => {
    const sortedEntryList = sortFileManagerEntryList([
      createEntry({
        name: '文档10.md',
        path: 'D:/docs/文档10.md',
        kind: 'markdown',
      }),
      createEntry({
        name: 'assets',
        path: 'D:/docs/assets',
        kind: 'directory',
      }),
      createEntry({
        name: '文档2.md',
        path: 'D:/docs/文档2.md',
        kind: 'markdown',
      }),
    ], {
      field: 'name',
      direction: 'desc',
    })

    expect(sortedEntryList.map(entry => entry.name)).toEqual([
      'assets',
      '文档10.md',
      '文档2.md',
    ])
  })

  it('type 排序应遵循业务类型顺序，而不是裸扩展名字典序', () => {
    const sortedEntryList = sortFileManagerEntryList([
      createEntry({
        name: 'voice.mp3',
        path: 'D:/docs/voice.mp3',
        kind: 'file',
      }),
      createEntry({
        name: 'sheet.xlsx',
        path: 'D:/docs/sheet.xlsx',
        kind: 'file',
      }),
      createEntry({
        name: 'cover.png',
        path: 'D:/docs/cover.png',
        kind: 'file',
      }),
      createEntry({
        name: 'readme.md',
        path: 'D:/docs/readme.md',
        kind: 'file',
      }),
    ], {
      field: 'type',
      direction: 'asc',
    })

    expect(sortedEntryList.map(entry => resolveFileManagerEntryType(entry))).toEqual([
      'markdown',
      'image',
      'sheet',
      'audio',
    ])
  })

  it('modifiedTime 排序应使用 modifiedTimeMs，并在并列时稳定回退到名称比较', () => {
    const sortedEntryList = sortFileManagerEntryList([
      createEntry({
        name: '文档10.md',
        path: 'D:/docs/文档10.md',
        kind: 'markdown',
        modifiedTimeMs: 100,
      }),
      createEntry({
        name: '文档2.md',
        path: 'D:/docs/文档2.md',
        kind: 'markdown',
        modifiedTimeMs: 100,
      }),
      createEntry({
        name: '最新.md',
        path: 'D:/docs/最新.md',
        kind: 'markdown',
        modifiedTimeMs: 300,
      }),
    ], {
      field: 'modifiedTime',
      direction: 'desc',
    })

    expect(sortedEntryList.map(entry => entry.name)).toEqual([
      '最新.md',
      '文档2.md',
      '文档10.md',
    ])
  })

  it('modifiedTime 排序应先为每个条目预计算类型键，不能在比较阶段重复放大 kind 读取次数', () => {
    const trackedEntryList = Array.from({ length: 8 }, (_, index) => {
      let kindReadCount = 0

      return {
        entry: {
          name: `文档${8 - index}.md`,
          path: `D:/docs/文档${8 - index}.md`,
          get kind() {
            kindReadCount += 1
            return 'markdown'
          },
          modifiedTimeMs: index,
        },
        getKindReadCount: () => kindReadCount,
      }
    })

    sortFileManagerEntryList(trackedEntryList.map(item => item.entry), {
      field: 'modifiedTime',
      direction: 'desc',
    })

    expect(trackedEntryList.reduce((sum, item) => sum + item.getKindReadCount(), 0)).toBeLessThanOrEqual(48)
  })

  it('缺失排序配置时应回退到默认 type 升序排序', () => {
    const sortedEntryList = sortFileManagerEntryList([
      createEntry({
        name: 'voice.mp3',
        path: 'D:/docs/voice.mp3',
        kind: 'file',
      }),
      createEntry({
        name: 'assets',
        path: 'D:/docs/assets',
        kind: 'directory',
      }),
      createEntry({
        name: 'readme.md',
        path: 'D:/docs/readme.md',
        kind: 'file',
      }),
    ])

    expect(sortedEntryList.map(entry => entry.name)).toEqual([
      'assets',
      'readme.md',
      'voice.mp3',
    ])
  })
})
