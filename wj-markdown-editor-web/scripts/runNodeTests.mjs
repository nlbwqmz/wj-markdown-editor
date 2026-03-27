import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { argv, cwd, execPath, exit } from 'node:process'

/**
 * 递归收集当前包内所有 node:test 用例。
 * vitest 专用文件会交给 vitest 运行，这里必须显式排除，避免被 node --test 误扫。
 *
 * @param {string} rootDir
 * @returns {string[]} 返回相对项目根目录的测试文件路径列表。
 */
function collectNodeTestFiles(rootDir) {
  const waiting = [rootDir]
  const result = []

  while (waiting.length > 0) {
    const currentDir = waiting.pop()
    const entryList = readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entryList) {
      const fullPath = join(currentDir, entry.name)

      if (entry.isDirectory()) {
        waiting.push(fullPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      if (!entry.name.endsWith('.test.js')) {
        continue
      }

      if (entry.name.endsWith('.vitest.test.js')) {
        continue
      }

      result.push(relative(cwd(), fullPath))
    }
  }

  return result.sort()
}

const forwardedTargets = argv.slice(2)
const defaultTargets = collectNodeTestFiles(join(cwd(), 'src'))
const testTargets = forwardedTargets.length > 0 ? forwardedTargets : defaultTargets

if (testTargets.length === 0) {
  console.error('[runNodeTests] 未找到可执行的 node:test 文件')
  exit(1)
}

const testProcessResult = spawnSync(execPath, ['--test', ...testTargets], {
  cwd: cwd(),
  stdio: 'inherit',
})

exit(testProcessResult.status ?? 1)
