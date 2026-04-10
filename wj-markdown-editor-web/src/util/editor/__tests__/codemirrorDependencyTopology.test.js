import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { test } = await import('node:test')

/**
 * 基于当前包根目录创建 require，确保解析结果与真实构建保持一致。
 * 这里不依赖运行时编辑器实例，只验证依赖拓扑是否已经分叉。
 */
const packageJsonUrl = new URL('../../../../package.json', import.meta.url)
const requireFromPackage = createRequire(packageJsonUrl)

function readPackageJson() {
  return JSON.parse(readFileSync(packageJsonUrl, 'utf8'))
}

test('package.json 必须显式声明并锁定编辑器直接使用的 CodeMirror 依赖矩阵', () => {
  const packageJson = readPackageJson()

  assert.deepEqual(
    {
      autocomplete: packageJson.dependencies?.['@codemirror/autocomplete'],
      commands: packageJson.dependencies?.['@codemirror/commands'],
      language: packageJson.dependencies?.['@codemirror/language'],
      search: packageJson.dependencies?.['@codemirror/search'],
      state: packageJson.dependencies?.['@codemirror/state'],
      view: packageJson.dependencies?.['@codemirror/view'],
      codemirror: packageJson.dependencies?.codemirror,
    },
    {
      autocomplete: '^6.20.1',
      commands: '^6.10.3',
      language: '^6.12.3',
      search: '^6.6.0',
      state: '^6.6.0',
      view: '^6.41.0',
      codemirror: undefined,
    },
    '编辑器依赖矩阵必须与 6.41.0 升级方案保持一致，并通过 lock 文件把实际安装结果锁到目标版本',
  )
})

test('@codemirror/search 必须和应用根目录解析到同一份 @codemirror/view', () => {
  const rootViewEntry = requireFromPackage.resolve('@codemirror/view')
  const searchEntry = requireFromPackage.resolve('@codemirror/search')
  const requireFromSearch = createRequire(searchEntry)
  const searchViewEntry = requireFromSearch.resolve('@codemirror/view')

  assert.equal(
    searchViewEntry,
    rootViewEntry,
    [
      '检测到 @codemirror/search 正在解析独立的 @codemirror/view 副本。',
      `应用根目录解析结果: ${rootViewEntry}`,
      `@codemirror/search 解析结果: ${searchViewEntry}`,
      '这会让同一编辑器内同时存在两套 view 实现，已知会导致滚动、选区和点击坐标行为失真。',
    ].join('\n'),
  )
})
