import path from 'node:path'
import { app } from 'electron'
import fs from 'fs-extra'

/**
 * 上次打开的标签组。
 *
 * 这份记录只服务“重启后恢复打开了哪些文档”，与 `recent.json` 是两件事：
 * 1. `recent` 是全局的最近文件路径历史，有 `recentMax` 上限，服务最近文件菜单
 * 2. 这里只记一个窗口的标签顺序与活动标签，不套 `recentMax`，
 *    否则“开了 15 个标签重启只回来 10 个”
 */
// 路径必须惰性求值：
// windowLifecycleService 会在导入阶段连带引入本模块，
// 而部分测试环境只提供了最小的 electron mock。
function getDocumentsPath() {
  return app.isPackaged
    ? path.resolve(app.getPath('documents'), 'wj-markdown-editor')
    : app.getAppPath()
}

function getTabGroupPath() {
  return path.resolve(getDocumentsPath(), 'tab-group.json')
}

const EMPTY_TAB_GROUP = {
  tabs: [],
  activeIndex: 0,
}

let tabGroup = { ...EMPTY_TAB_GROUP }

function isWindowsComparablePath(targetPath) {
  return /^[a-z]:[\\/]/i.test(targetPath) || targetPath.startsWith('\\\\')
}

/**
 * 标签组去重用的路径比较键。
 *
 * 只有 Windows（以及 Windows 形状的盘符 / UNC 路径）需要折叠大小写与分隔符：
 * - NTFS 默认大小写不敏感，`C:/docs/A.md` 与 `c:\docs\a.md` 指向同一文件
 * - Linux 上 `README.md` 与 `readme.md` 是两个不同文件，`\` 还是合法文件名字符，
 *   无条件 `toLowerCase()` 或 `\`→`/` 替换都会把不同文档判成同一路径，
 *   进而在写盘时静默丢掉一个标签
 *
 * 这里不复用 `toComparableDocumentPath()`：它的 POSIX 分支同样会执行 `\`→`/`，
 * 对 Linux 上文件名含反斜杠的文档不安全。
 */
function toComparableTabPath(targetPath) {
  if (isWindowsComparablePath(targetPath) || process.platform === 'win32') {
    return path.win32.normalize(targetPath.replaceAll('/', '\\')).toLowerCase()
  }
  return targetPath
}

function normalizeTabGroup(rawTabGroup) {
  if (!rawTabGroup || typeof rawTabGroup !== 'object') {
    return { ...EMPTY_TAB_GROUP }
  }

  const seenPathKey = new Set()
  const tabList = (Array.isArray(rawTabGroup.tabs) ? rawTabGroup.tabs : [])
    .map((item) => {
      return typeof item === 'string' && item.trim() !== '' ? item.trim() : null
    })
    .filter((item) => {
      if (!item) {
        return false
      }
      // 同一路径只允许出现一次，避免恢复时出现两个指向同一文件的标签。
      const comparableKey = toComparableTabPath(item)
      if (seenPathKey.has(comparableKey)) {
        return false
      }
      seenPathKey.add(comparableKey)
      return true
    })

  const rawActiveIndex = Number.isInteger(rawTabGroup.activeIndex) ? rawTabGroup.activeIndex : 0
  const activeIndex = tabList.length === 0
    ? 0
    : Math.min(Math.max(rawActiveIndex, 0), tabList.length - 1)

  return {
    tabs: tabList,
    activeIndex,
  }
}

async function initTabGroup() {
  try {
    const documentsPath = getDocumentsPath()
    const tabGroupPath = getTabGroupPath()
    await fs.ensureDir(documentsPath)
    if (!await fs.pathExists(tabGroupPath)) {
      tabGroup = { ...EMPTY_TAB_GROUP }
      return get()
    }
    const rawContent = await fs.readFile(tabGroupPath, 'utf-8')
    tabGroup = normalizeTabGroup(JSON.parse(rawContent))
  }
  catch {
    // 标签组只是启动体验的附属持久化，读取失败时退回空组，不能阻塞启动。
    tabGroup = { ...EMPTY_TAB_GROUP }
  }
  return get()
}

function get() {
  return {
    tabs: [...tabGroup.tabs],
    activeIndex: tabGroup.activeIndex,
  }
}

async function save(nextTabGroup) {
  tabGroup = normalizeTabGroup(nextTabGroup)
  try {
    await fs.ensureDir(getDocumentsPath())
    await fs.writeFile(getTabGroupPath(), JSON.stringify(tabGroup, null, 2), 'utf-8')
  }
  catch (error) {
    // 写盘失败只影响下次启动的恢复体验，不影响当前会话。
    console.error('[tab-group] save failed:', error)
  }
  return get()
}

/**
 * 同步写盘，只给关窗链路用。
 *
 * 最后一个窗口关闭时 `checkWinList()` 会立刻 `app.exit()`，
 * 异步写盘会被进程退出截断，所以关窗必须同步落盘。
 */
function saveSync(nextTabGroup) {
  tabGroup = normalizeTabGroup(nextTabGroup)
  try {
    fs.ensureDirSync(getDocumentsPath())
    fs.writeFileSync(getTabGroupPath(), JSON.stringify(tabGroup, null, 2), 'utf-8')
  }
  catch (error) {
    // 写盘失败只影响下次启动的恢复体验，不能阻塞关窗。
    console.error('[tab-group] saveSync failed:', error)
  }
  return get()
}

async function clear() {
  return await save(EMPTY_TAB_GROUP)
}

export default {
  initTabGroup,
  get,
  save,
  saveSync,
  clear,
}
