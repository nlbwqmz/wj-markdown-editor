import { fileURLToPath } from 'node:url'
import { isMarkdownFilePath } from './document-session/documentOpenTargetUtil.js'

function normalizeNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

const FILE_URL_PATTERN = /^file:\/\//i

/**
 * 把单个启动参数归一化成可用的打开目标。
 *
 * Linux 上 electron-builder 生成的 .desktop 用 `%U` 传参，文件管理器双击 Markdown 时
 * 拿到的是 `file:///home/u/a.md` 这样的 URI，而不是本地路径：
 * 1. `file://` 必须转成本地路径，否则会被当成相对路径拼到 cwd 后面
 * 2. `--no-sandbox`、`--ozone-platform=wayland` 这类开关必须跳过
 * 3. 转不出来（畸形 URI / 空串 / 开关）时返回 null，交给调用方继续往前找
 *
 * @param {unknown} arg 单个启动参数
 * @returns {string | null} 归一化后的本地路径；不可用时返回 null
 */
function resolveOpenTargetArg(arg) {
  if (typeof arg !== 'string') {
    return null
  }

  const trimmedArg = arg.trim()
  if (trimmedArg === '' || trimmedArg.startsWith('-')) {
    return null
  }

  if (FILE_URL_PATTERN.test(trimmedArg) === false) {
    return trimmedArg
  }

  try {
    return fileURLToPath(trimmedArg)
  }
  catch {
    return null
  }
}

/**
 * 从命令行参数里找出 Markdown 打开目标。
 *
 * 从后往前扫描：`argv[0]` 是可执行文件路径，`%U` 可以携带多个 URI，
 * 后面还可能跟随 Electron 追加的开关。
 *
 * @param {unknown} args 命令行参数列表
 * @returns {string | null} 命中的本地路径；没有时返回 null
 */
function resolveOpenTargetFromArgs(args) {
  const argList = Array.isArray(args) ? args : []
  for (let index = argList.length - 1; index >= 0; index--) {
    const targetPath = resolveOpenTargetArg(argList[index])
    if (targetPath && isMarkdownFilePath(targetPath)) {
      return targetPath
    }
  }
  return null
}

/**
 * 解析 second-instance 事件携带的打开目标。
 *
 * Electron 在单实例载荷（additionalData）反序列化失败时会把第 4 个参数传成 null，
 * 且旧版本在载荷中含空格等空白字节时存在上游序列化缺陷（见 issue #59），
 * 因此这里把事件自带的 commandLine 作为等价兜底信息源：
 * 1. additionalData 完好时优先使用，同时保留 baseDir 语义；
 * 2. 否则从第二实例命令行参数中回查 Markdown 文件路径，保证双击打开能力不受影响。
 */
function resolveSecondInstanceOpenTarget({ additionalData, commandLine }) {
  // 载荷里的 filePath 也可能来自旧版本（未做 URI 转换），这里一并归一化。
  const payloadFilePath = resolveOpenTargetArg(additionalData?.filePath)
  if (payloadFilePath) {
    return {
      targetPath: payloadFilePath,
      baseDir: normalizeNonEmptyString(additionalData?.baseDir),
    }
  }

  const commandLineTargetPath = resolveOpenTargetFromArgs(commandLine)
  if (commandLineTargetPath) {
    return {
      targetPath: commandLineTargetPath,
      baseDir: null,
    }
  }

  return null
}

async function handleStartupOpenRequest({
  targetPath,
  baseDir,
  openDocumentPath,
  createDraftWindow,
}) {
  const openResult = await openDocumentPath(targetPath, {
    trigger: 'startup',
    baseDir,
  })
  if (openResult?.ok === true) {
    return openResult
  }

  await createDraftWindow()
  return openResult
}

async function handleSecondInstanceOpenRequest({
  targetPath,
  baseDir,
  openDocumentPath,
}) {
  return await openDocumentPath(targetPath, {
    trigger: 'second-instance',
    baseDir,
  })
}

export {
  handleSecondInstanceOpenRequest,
  handleStartupOpenRequest,
  resolveOpenTargetArg,
  resolveOpenTargetFromArgs,
  resolveSecondInstanceOpenTarget,
}

export default {
  handleSecondInstanceOpenRequest,
  handleStartupOpenRequest,
  resolveOpenTargetArg,
  resolveOpenTargetFromArgs,
  resolveSecondInstanceOpenTarget,
}
