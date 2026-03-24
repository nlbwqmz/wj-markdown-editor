import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function getObjectPropertyBlock(source, propertyName) {
  const propertyIndex = source.indexOf(`${propertyName}:`)
  assert.notEqual(propertyIndex, -1, `未找到 ${propertyName} 属性`)

  const blockStart = source.indexOf('{', propertyIndex)
  assert.notEqual(blockStart, -1, `${propertyName} 属性块缺少起始大括号`)

  let braceDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false
  let escaped = false

  for (let i = blockStart; i < source.length; i++) {
    const char = source[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (!inDoubleQuote && !inTemplate && char === '\'') {
      inSingleQuote = !inSingleQuote
      continue
    }
    if (!inSingleQuote && !inTemplate && char === '"') {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    if (!inSingleQuote && !inDoubleQuote && char === '`') {
      inTemplate = !inTemplate
      continue
    }

    if (inSingleQuote || inDoubleQuote || inTemplate) {
      continue
    }

    if (char === '{') {
      braceDepth++
      continue
    }
    if (char === '}') {
      braceDepth--
      if (braceDepth === 0) {
        return source.slice(blockStart, i + 1)
      }
    }
  }

  assert.fail(`${propertyName} 属性块没有正确闭合`)
}

function assertPreviewThemeDefaultIsGithub(source) {
  const previewThemeBlock = getObjectPropertyBlock(source, 'previewTheme')
  assert.match(previewThemeBlock, /default:\s*\(\)\s*=>\s*'github'/)
}

function assertGithubThemeFallbackCodeBlockStyle(source) {
  assert.match(
    source,
    /\.preview-theme-github\s+\.highlight pre,\s*\.preview-theme-github\s+pre:not\(\.hljs\)\s*\{[\s\S]*?color:\s*var\(--fgColor-default\);[\s\S]*?background-color:\s*var\(--bgColor-muted\);[\s\S]*?\}/,
  )
}

function assertPreviewThemeRegressionFixtureCoverage(source) {
  const requiredMarkers = [
    '![示例图片](',
    '!audio(',
    '!video(',
    '[^preview-theme]',
    '> [!TIP]',
    '::: details',
    '`const theme = \'github\'`',
    '```js',
  ]

  requiredMarkers.forEach((marker) => {
    assert.equal(source.includes(marker), true, `回归样本缺少关键标记：${marker}`)
  })
}

test('预览组件默认主题值必须统一为 github', () => {
  const previewSource = readSource('../../../components/editor/MarkdownPreview.vue')
  const editSource = readSource('../../../components/editor/MarkdownEdit.vue')

  assertPreviewThemeDefaultIsGithub(previewSource)
  assertPreviewThemeDefaultIsGithub(editSource)
  assert.equal(previewSource.includes('github-light'), false)
  assert.equal(editSource.includes('github-light'), false)
})

test('断言必须限定在 previewTheme 属性块内', () => {
  const previewSource = readSource('../../../components/editor/MarkdownPreview.vue')
  const mutatedPreviewSource = previewSource
    .replace(/previewTheme:\s*\{[\s\S]*?default:\s*\(\)\s*=>\s*'github'[\s\S]*?\}/, `previewTheme: {
    type: String,
    default: () => 'broken-theme',
  }`)
    .replace(/default:\s*\(\)\s*=>\s*'atom-one-dark'/, `default: () => 'github'`)

  assert.throws(() => assertPreviewThemeDefaultIsGithub(mutatedPreviewSource))
})

test('github 预览主题需要覆盖未高亮代码块的回退样式', () => {
  const githubThemeSource = readSource('../preview-theme/theme/github.css')

  assertGithubThemeFallbackCodeBlockStyle(githubThemeSource)
})

test('预览主题回归样本必须覆盖关键 Markdown 标记', () => {
  const regressionFixtureSource = readSource('./fixtures/preview-theme-regression.md')

  assertPreviewThemeRegressionFixtureCoverage(regressionFixtureSource)
})
