import { isMarkdownFilePath } from './document-session/documentOpenTargetUtil.js'

function normalizeNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
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
  const payloadFilePath = normalizeNonEmptyString(additionalData?.filePath)
  if (payloadFilePath) {
    return {
      targetPath: payloadFilePath,
      baseDir: normalizeNonEmptyString(additionalData?.baseDir),
    }
  }

  // 从后往前扫描：第二实例的 argv[0] 是可执行文件路径，路径后还可能跟随 Electron 追加的开关。
  const commandLineArgs = Array.isArray(commandLine) ? commandLine : []
  for (let index = commandLineArgs.length - 1; index >= 0; index--) {
    const commandLineArg = commandLineArgs[index]
    if (isMarkdownFilePath(commandLineArg)) {
      return {
        targetPath: commandLineArg,
        baseDir: null,
      }
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
  resolveSecondInstanceOpenTarget,
}

export default {
  handleSecondInstanceOpenRequest,
  handleStartupOpenRequest,
  resolveSecondInstanceOpenTarget,
}
