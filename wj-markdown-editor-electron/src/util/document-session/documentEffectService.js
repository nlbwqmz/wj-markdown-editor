import path from 'node:path'
import { dialog, Notification } from 'electron'
import fs from 'fs-extra'
import { APP_NOTIFICATION_ICON_PATH } from '../appIdentityUtil.js'
import {
  isMarkdownFilePath,
  MARKDOWN_FILE_EXTENSION_LIST,
  resolveDocumentOpenPath,
  toComparableDocumentPath,
} from './documentOpenTargetUtil.js'

// 从多种 payload 形态里提取目标路径。
// 兼容层有时直接传字符串，有时传对象，这里统一收口成 path 或 null。
function getRecentTargetPath(payload) {
  if (typeof payload === 'string') {
    return payload
  }
  return typeof payload?.path === 'string' ? payload.path : null
}

// 提取打开路径时使用的基准目录。
// 只有显式传入且非空时才生效，避免把空字符串误当成有效 baseDir。
function getOpenBaseDir(payload) {
  return typeof payload?.baseDir === 'string' && payload.baseDir.trim() !== ''
    ? payload.baseDir
    : null
}

// 读取当前语言配置。
// effect 层只在少数需要即时拼接系统提示文案的场景使用它。
function getLanguage(getConfig) {
  return getConfig?.()?.language || 'zh-CN'
}

function getOpenTrigger(payload) {
  return typeof payload?.trigger === 'string' && payload.trigger
    ? payload.trigger
    : 'user'
}

function getOpenEntrySource(payload, fallbackEntrySource = null) {
  if (typeof payload?.entrySource === 'string' && payload.entrySource) {
    return payload.entrySource
  }
  return fallbackEntrySource
}

function isRecentEntrySource(entrySource) {
  return entrySource === 'recent'
}

function getComparableCurrentSnapshotDocumentPath(getSessionSnapshot) {
  const snapshot = getSessionSnapshot?.() || null
  if (snapshot?.isRecentMissing === true) {
    return null
  }
  return toComparableDocumentPath(snapshot?.resourceContext?.documentPath || null)
}

function attachSourceSessionEnvelope(result, payload) {
  if (!result || typeof result !== 'object') {
    return result
  }

  const nextResult = {
    ...result,
  }
  if (typeof payload?.sourceSessionId === 'string' && payload.sourceSessionId) {
    nextResult.sourceSessionId = payload.sourceSessionId
  }
  if (payload?.sourceRevision !== undefined) {
    nextResult.sourceRevision = payload.sourceRevision
  }
  return nextResult
}

function createSourceSessionChangedResult(documentPath) {
  return {
    ok: false,
    reason: 'source-session-changed',
    path: documentPath || null,
  }
}

const OPEN_CURRENT_WINDOW_SWITCH_POLICY_SET = new Set([
  'direct-switch',
  'save-before-switch',
  'discard-switch',
])

function hasValidOpenCurrentWindowExecutePayload(payload) {
  return OPEN_CURRENT_WINDOW_SWITCH_POLICY_SET.has(payload?.switchPolicy)
    && typeof payload?.expectedSessionId === 'string'
    && payload.expectedSessionId
    && Number.isFinite(payload?.expectedRevision)
}

// 判断目标路径是否是一个常规文件。
// 这里单独包装成异步 helper，是为了把“文件不存在 / stat 失败”统一折叠成 false。
async function isRegularFile(fsModule, targetPath) {
  try {
    const stat = await fsModule.stat(targetPath)
    return stat?.isFile?.() === true
  } catch {
    return false
  }
}

// 把任意错误压平成可序列化对象。
// 副作用层需要把错误安全地回流到命令层或消息系统，不能直接传递原始 Error 实例。
function serializeError(error) {
  if (!error) {
    return null
  }

  return {
    name: typeof error.name === 'string' ? error.name : 'Error',
    message: typeof error.message === 'string' ? error.message : String(error),
    code: typeof error.code === 'string' ? error.code : null,
  }
}

// 把 watcher 相关警告 effect 转成统一的窗口提示消息结构。
// 当前复用 renderer 已存在的 i18n key，避免继续扩散新的文案协议。
function getWatchWarningMessage(effect) {
  return {
    type: effect?.level || 'warning',
    // 当前 renderer 侧已有这条 i18n key，先统一复用，避免为了补重绑链路再扩散新的文案契约。
    content: 'message.fileExternalChangeReadFailed',
  }
}

function getWatchingDirectoryPath(rebindResult, fallbackPath = null) {
  if (typeof rebindResult?.watchingDirectoryPath === 'string' && rebindResult.watchingDirectoryPath.trim() !== '') {
    return rebindResult.watchingDirectoryPath
  }

  const watchingPath = rebindResult?.watchingPath || fallbackPath
  if (typeof watchingPath !== 'string' || watchingPath.trim() === '') {
    return null
  }

  return path.dirname(resolveDocumentOpenPath(watchingPath) || watchingPath)
}

function isWindowsLikePath(targetPath) {
  return /^[a-z]:[\\/]/i.test(targetPath) || targetPath.startsWith('\\\\')
}

function getPathFileName(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    return ''
  }

  if (isWindowsLikePath(targetPath)) {
    return path.win32.basename(targetPath.replaceAll('/', '\\'))
  }

  return path.posix.basename(targetPath.replaceAll('\\', '/'))
}

function getExternalChangeNotificationContent({
  documentPath,
  mode = 'applied',
  language = 'zh-CN',
}) {
  const fileName = getPathFileName(documentPath)
  const isPromptMode = mode === 'prompt'
  const isMissingMode = mode === 'missing'

  if (language === 'en-US') {
    return {
      title: isMissingMode
        ? (fileName ? `File deleted or moved - ${fileName}` : 'File deleted or moved')
        : (fileName ? `File content updated - ${fileName}` : 'File content updated'),
      body: documentPath
        ? `${isMissingMode
          ? 'The file was deleted or moved externally. Please return to the editor to review it.'
          : isPromptMode
            ? 'The file was modified externally. Please return to the editor to review and handle it.'
            : 'The file was modified externally and the latest content has been applied automatically.'}\nPath: ${documentPath}`
        : isMissingMode
          ? 'The file was deleted or moved externally. Please return to the editor to review it.'
          : isPromptMode
            ? 'The file was modified externally. Please return to the editor to review and handle it.'
            : 'The file was modified externally and the latest content has been applied automatically.',
    }
  }

  return {
    title: isMissingMode
      ? (fileName ? `文件已被删除或移动 - ${fileName}` : '文件已被删除或移动')
      : (fileName ? `文件内容已更新 - ${fileName}` : '文件内容已更新'),
    body: documentPath
      ? `${isMissingMode
        ? '检测到文件已被外部删除或移动，请返回编辑器查看。'
        : isPromptMode
          ? '检测到文件被外部修改，请返回编辑器查看并处理。'
          : '检测到文件被外部修改，已自动应用最新内容。'}\n路径：${documentPath}`
      : isMissingMode
        ? '检测到文件已被外部删除或移动，请返回编辑器查看。'
        : isPromptMode
          ? '检测到文件被外部修改，请返回编辑器查看并处理。'
          : '检测到文件被外部修改，已自动应用最新内容。',
  }
}

function getExternalChangeFallbackMessage(mode, documentPath) {
  if (mode === 'applied') {
    return {
      type: 'info',
      content: 'message.fileExternalChangeAutoApplied',
    }
  }

  if (mode === 'missing') {
    return {
      type: 'info',
      content: documentPath
        ? `检测到文件已被外部删除或移动，请返回编辑器查看。\n路径：${documentPath}`
        : '检测到文件已被外部删除或移动，请返回编辑器查看。',
    }
  }

  return {
    type: 'info',
    content: documentPath
      ? `检测到文件被外部修改，请返回编辑器查看并处理。\n路径：${documentPath}`
      : '检测到文件被外部修改，请返回编辑器查看并处理。',
  }
}

/**
 * 主进程统一副作用层。
 *
 * 这里刻意不直接持有 session 真相，只负责这些“必须碰外部世界”的动作：
 * 1. 文件系统读写
 * 2. 系统对话框
 * 3. recent 持久化
 * 4. watcher 重绑
 * 5. 保存失败消息标准化
 *
 * 这样命令层仍保持纯状态裁决，副作用层只消费 effect / command，
 * 可以避免把旧的 winInfo 兼容镜像再次混回状态真相里。
 */
export function createDocumentEffectService({
  fsModule = fs,
  dialogApi = dialog,
  notificationApi = Notification,
  createSystemNotification = options => new notificationApi(options),
  notificationIconPath = APP_NOTIFICATION_ICON_PATH,
  fileManagerService = null,
  recentStore = {
    add: async () => {},
    remove: async () => {},
    clear: async () => {},
    get: () => [],
  },
  getConfig = () => ({}),
}) {
  /**
   * 校验一条“显式打开目标”是否可用。
   *
   * 这里既处理相对路径解析，也做四层校验：
   * 1. 是否能解析出目标路径
   * 2. 路径是否存在
   * 3. 是否是 markdown 扩展名
   * 4. 是否是常规文件而不是目录等其他实体
   */
  async function validateExplicitOpenTarget(targetPath, {
    baseDir,
    missingReason = 'open-target-missing',
    ensureReadable = false,
  } = {}) {
    const resolvedTargetPath = resolveDocumentOpenPath(targetPath, { baseDir })

    if (!resolvedTargetPath) {
      return {
        ok: false,
        reason: missingReason,
        path: null,
      }
    }
    if (!await fsModule.pathExists(resolvedTargetPath)) {
      return {
        ok: false,
        reason: missingReason,
        path: resolvedTargetPath,
      }
    }
    if (!isMarkdownFilePath(resolvedTargetPath)) {
      return {
        ok: false,
        reason: 'open-target-invalid-extension',
        path: resolvedTargetPath,
      }
    }
    if (!await isRegularFile(fsModule, resolvedTargetPath)) {
      return {
        ok: false,
        reason: 'open-target-not-file',
        path: resolvedTargetPath,
      }
    }
    if (ensureReadable) {
      try {
        await fsModule.readFile(resolvedTargetPath, 'utf-8')
      } catch {
        return {
          ok: false,
          reason: 'open-target-read-failed',
          path: resolvedTargetPath,
        }
      }
    }
    return {
      ok: true,
      path: resolvedTargetPath,
    }
  }

  async function resolveOpenTargetDecision(payload, {
    getSessionSnapshot,
    getExistingWindowIdByPath,
    fallbackEntrySource = null,
  } = {}) {
    const entrySource = getOpenEntrySource(payload, fallbackEntrySource)
    const validationResult = await validateExplicitOpenTarget(getRecentTargetPath(payload), {
      baseDir: getOpenBaseDir(payload),
      missingReason: isRecentEntrySource(entrySource) ? 'recent-missing' : 'open-target-missing',
    })
    if (validationResult.ok !== true) {
      return validationResult
    }

    const resolvedTargetPath = validationResult.path
    if (getComparableCurrentSnapshotDocumentPath(getSessionSnapshot) === toComparableDocumentPath(resolvedTargetPath)) {
      return {
        ok: true,
        decision: 'noop-current-file',
        path: resolvedTargetPath,
      }
    }

    const existingWindowId = getExistingWindowIdByPath?.(resolvedTargetPath) || null
    if (existingWindowId) {
      return {
        ok: true,
        decision: 'focused-existing-window',
        path: resolvedTargetPath,
        windowId: existingWindowId,
      }
    }

    try {
      await fsModule.readFile(resolvedTargetPath, 'utf-8')
    } catch {
      return {
        ok: false,
        reason: 'open-target-read-failed',
        path: resolvedTargetPath,
      }
    }

    return {
      ok: true,
      decision: 'needs-open-mode-choice',
      path: resolvedTargetPath,
    }
  }

  // 生成保存失败提示文案。
  // 自动保存和手动保存需要区分文案，同时根据当前语言返回中英文文本。
  function getFailedSaveMessage(trigger, error) {
    const errorDetail = typeof error?.message === 'string' && error.message
      ? ` ${error.message}`
      : ''
    const isAutoSave = trigger === 'blur-auto-save' || trigger === 'close-auto-save'
    if (getLanguage(getConfig) === 'en-US') {
      return isAutoSave ? `Auto save failed.${errorDetail}` : `Save failed.${errorDetail}`
    }
    return isAutoSave ? `自动保存失败。${errorDetail}` : `保存失败。${errorDetail}`
  }

  function getExternalWatchContext(externalWatchController) {
    return externalWatchController?.getContext?.() || {}
  }

  function shouldRebindExternalWatchAfterSave(externalWatchController) {
    return getExternalWatchContext(externalWatchController)?.shouldRebindAfterSave === true
  }

  function publishWindowMessage(windowMessageController, data) {
    return windowMessageController?.publishWindowMessage?.(data) || null
  }

  async function finalizeFocusedExistingWindowResult(result, {
    focusWindowById,
    fallbackPath = null,
  } = {}) {
    const decision = typeof result?.decision === 'string'
      ? result.decision
      : result?.reason
    if (result?.ok !== true || decision !== 'focused-existing-window' || !result.windowId) {
      return result
    }

    try {
      focusWindowById?.(result.windowId)
    } catch {
      // 聚焦失败不应反向打断结构化返回，保持调用方能继续按 focused-existing-window 处理。
    }

    const recentPath = typeof result?.path === 'string' && result.path
      ? result.path
      : fallbackPath
    if (!recentPath) {
      return result
    }

    try {
      await recentStore.add(recentPath)
    } catch {
      // recent 顺序刷新只是附属副作用，失败时不能把“已聚焦已有窗口”的主结果改写成失败。
    }
    return result
  }

  function notifyExternalChange(effect, { focusWindow, windowMessageController }) {
    const content = getExternalChangeNotificationContent({
      documentPath: effect?.documentPath || null,
      mode: effect?.mode || 'applied',
      language: getLanguage(getConfig),
    })

    try {
      if (notificationApi?.isSupported?.() === true) {
        const notification = createSystemNotification({
          ...content,
          icon: notificationIconPath,
        })
        notification?.on?.('click', () => {
          focusWindow?.()
        })
        notification?.show?.()
        return null
      }
    } catch {
      // 系统通知创建失败时，退回统一窗口消息，避免这类提示被静默吞掉。
    }

    publishWindowMessage(windowMessageController, getExternalChangeFallbackMessage(
      effect?.mode || 'applied',
      effect?.documentPath || null,
    ))
    return null
  }

  /**
   * 执行“主动命令类”副作用。
   *
   * 这一层处理的不是命令层产出的 effects，
   * 而是主进程直接需要做的外部动作，例如：
   * 1. 打开系统文件选择框
   * 2. 打开文档窗口
   * 3. recent 列表读写
   * 4. 向外暴露当前 session snapshot
   */
  async function executeCommand({
    windowId,
    command,
    payload,
    dispatchCommand: _dispatchCommand,
    prepareOpenPathInCurrentWindow,
    openDocumentWindow,
    openDocumentInCurrentWindow,
    getExistingWindowIdByPath,
    getSessionSnapshot,
    focusWindowById,
  }) {
    switch (command) {
      case 'document.request-open-dialog': {
        try {
          // 打开系统文件选择框时只负责返回固定结果结构，
          // 后续如何打开由 renderer 继续走新的决策链路。
          const filePathList = dialogApi.showOpenDialogSync({
            title: 'Open Markdown File',
            properties: ['openFile'],
            filters: [
              { name: 'markdown file', extensions: MARKDOWN_FILE_EXTENSION_LIST },
            ],
          })
          if (filePathList && filePathList.length > 0) {
            return {
              ok: true,
              reason: 'selected',
              path: filePathList[0],
            }
          }
          return {
            ok: false,
            reason: 'cancelled',
            path: null,
          }
        } catch {
          return {
            ok: false,
            reason: 'dialog-open-failed',
            path: null,
          }
        }
      }

      case 'document.resolve-open-target':
        return await finalizeFocusedExistingWindowResult(await resolveOpenTargetDecision(payload, {
          getSessionSnapshot,
          getExistingWindowIdByPath,
        }), {
          focusWindowById,
          fallbackPath: getRecentTargetPath(payload),
        })

      case 'document.prepare-open-path-in-current-window': {
        const resolveResult = await resolveOpenTargetDecision(payload, {
          getSessionSnapshot,
          getExistingWindowIdByPath,
        })
        if (resolveResult.ok !== true) {
          return resolveResult
        }
        if (resolveResult.decision !== 'needs-open-mode-choice') {
          return await finalizeFocusedExistingWindowResult(
            attachSourceSessionEnvelope(resolveResult, payload),
            {
              focusWindowById,
              fallbackPath: resolveResult.path,
            },
          )
        }

        if (typeof prepareOpenPathInCurrentWindow === 'function') {
          const prepareResult = await prepareOpenPathInCurrentWindow(resolveResult.path, {
            entrySource: getOpenEntrySource(payload),
            trigger: getOpenTrigger(payload),
            sourceSessionId: payload?.sourceSessionId || null,
            sourceRevision: payload?.sourceRevision,
          })
          return await finalizeFocusedExistingWindowResult(
            attachSourceSessionEnvelope(prepareResult, payload),
            {
              focusWindowById,
              fallbackPath: resolveResult.path,
            },
          )
        }

        const snapshot = getSessionSnapshot?.() || null
        return await finalizeFocusedExistingWindowResult(attachSourceSessionEnvelope({
          ok: true,
          decision: snapshot?.dirty === true ? 'needs-save-choice' : 'ready-to-switch',
          path: resolveResult.path,
        }, payload), {
          focusWindowById,
          fallbackPath: resolveResult.path,
        })
      }

      case 'document.open-path': {
        // 直接按给定路径打开文档前，也必须先复用统一预判 helper，
        // 避免 open-path / recent / startup 分叉出不同的 current-file / focus 语义。
        const resolveResult = await resolveOpenTargetDecision(payload, {
          getSessionSnapshot,
          getExistingWindowIdByPath,
        })
        if (resolveResult.ok !== true || resolveResult.decision !== 'needs-open-mode-choice') {
          return await finalizeFocusedExistingWindowResult(resolveResult, {
            focusWindowById,
            fallbackPath: getRecentTargetPath(payload),
          })
        }
        return await openDocumentWindow?.(resolveResult.path, {
          isRecent: false,
          trigger: getOpenTrigger(payload),
        })
      }

      case 'document.open-path-in-current-window': {
        // execute 阶段只做当前窗口切换，
        // 不再自行压缩成旧的 saveBeforeSwitch 布尔协议。
        if (!hasValidOpenCurrentWindowExecutePayload(payload)) {
          return createSourceSessionChangedResult(getRecentTargetPath(payload))
        }

        const validationResult = await validateExplicitOpenTarget(getRecentTargetPath(payload), {
          baseDir: getOpenBaseDir(payload),
        })
        if (validationResult.ok !== true) {
          return validationResult
        }

        return await finalizeFocusedExistingWindowResult(await openDocumentInCurrentWindow?.(validationResult.path, {
          entrySource: getOpenEntrySource(payload),
          trigger: getOpenTrigger(payload),
          switchPolicy: payload?.switchPolicy || null,
          expectedSessionId: payload?.expectedSessionId || null,
          expectedRevision: payload?.expectedRevision,
        }), {
          focusWindowById,
          fallbackPath: validationResult.path,
        })
      }

      case 'document.open-recent': {
        const trigger = getOpenTrigger(payload)
        const resolveResult = await resolveOpenTargetDecision(payload, {
          getSessionSnapshot,
          getExistingWindowIdByPath,
          fallbackEntrySource: 'recent',
        })
        if (resolveResult.ok !== true) {
          if (resolveResult.reason !== 'recent-missing' || trigger !== 'startup') {
            return resolveResult
          }
          return await openDocumentWindow?.(resolveResult.path, {
            isRecent: true,
            trigger,
          })
        }
        if (resolveResult.decision !== 'needs-open-mode-choice') {
          return await finalizeFocusedExistingWindowResult(resolveResult, {
            focusWindowById,
            fallbackPath: getRecentTargetPath(payload),
          })
        }

        // recent 路径通过统一预判后，仍然交给 openDocumentWindow 处理新建/复用结果。
        return await openDocumentWindow?.(resolveResult.path, {
          isRecent: true,
          trigger,
        })
      }

      case 'document.get-session-snapshot':
        // effect 层对外暴露当前窗口对应的只读 snapshot。
        // 不直接返回 session 真相，避免调用方修改状态模型。
        return getSessionSnapshot?.() || null

      case 'recent.get-list':
        // recent 读取是纯同步视角，不做任何额外加工。
        return recentStore.get()

      case 'recent.remove': {
        // 删除指定 recent 条目。
        // 如果目标本来就不在列表里，返回 changed=false，避免无意义写盘。
        const targetPath = getRecentTargetPath(payload)
        const currentList = recentStore.get()
        const changed = currentList.some(item => item.path === targetPath)
        if (!changed) {
          return {
            ok: true,
            changed: false,
            list: currentList,
          }
        }
        await recentStore.remove(targetPath)
        return {
          ok: true,
          changed: true,
          list: recentStore.get(),
        }
      }

      case 'recent.clear': {
        // 清空 recent 列表。
        // 同样先判断当前是否为空，避免无变化时仍然触发一次持久化写入。
        const currentList = recentStore.get()
        if (currentList.length === 0) {
          return {
            ok: true,
            changed: false,
            list: currentList,
          }
        }
        await recentStore.clear()
        return {
          ok: true,
          changed: true,
          list: recentStore.get(),
        }
      }

      case 'file-manager.get-directory-state':
        return await fileManagerService?.getDirectoryState({
          windowId,
          directoryPath: payload?.directoryPath || null,
          includeModifiedTime: payload?.includeModifiedTime === true,
        })

      case 'file-manager.open-directory':
        return await fileManagerService?.openDirectory({
          windowId,
          directoryPath: payload?.directoryPath || null,
          includeModifiedTime: payload?.includeModifiedTime === true,
        })

      case 'file-manager.sync-current-directory-options':
        return await fileManagerService?.syncCurrentDirectoryOptions({
          windowId,
          includeModifiedTime: payload?.includeModifiedTime === true,
        })

      case 'file-manager.create-folder':
        return await fileManagerService?.createFolder({
          windowId,
          name: payload?.name || '',
        })

      case 'file-manager.create-markdown':
        return await fileManagerService?.createMarkdown({
          windowId,
          name: payload?.name || '',
        })

      default:
        throw new Error(`未知副作用命令: ${command}`)
    }
  }

  /**
   * 落地执行命令层产出的 effect。
   *
   * 命令层只产出“应该做什么”，这里才真正去碰文件系统、窗口 UI、对话框和 watcher。
   * 所有需要回流命令层继续推进状态机的动作，也都在这里统一调用 dispatchCommand。
   */
  async function applyEffect({
    effect,
    dispatchCommand,
    getSaveDialogTarget,
    getCopyDialogTarget,
    closeHostController,
    showUnsavedPrompt,
    showSaveFailedMessage,
    externalWatchController,
    windowMessageController,
    focusWindow,
  }) {
    if (!effect) {
      // 空 effect 直接忽略，保持调用方可以安全地按序执行返回列表。
      return null
    }

    switch (effect.type) {
      case 'execute-save':
        // 文档本体保存的完整副作用链：
        // 1. 先回流 save.started，推进状态机到 running
        // 2. 真正写文件
        // 3. 根据写盘结果回流 save.succeeded 或 save.failed
        // 保存任务的 started / succeeded / failed 必须全部回流命令层，
        // 这样状态推进、快照广播和迟到 effect 过滤才能共享同一套裁决。
        await dispatchCommand('save.started', {
          jobId: effect.job.jobId,
        })
        try {
          // 这里真正把冻结后的 job.content 写入目标路径。
          await fsModule.writeFile(effect.job.path, effect.job.content)
        } catch (error) {
          // 写盘失败后，统一回流 save.failed，让命令层决定错误收敛和关闭链路回退。
          await dispatchCommand('save.failed', {
            ...effect.job,
            error,
          })
          return null
        }

        await dispatchCommand('save.succeeded', {
          ...effect.job,
          savedAt: Date.now(),
          // 当前写盘成功后暂不补 stat，后续如果需要更精确 stat 可以再扩展。
          stat: null,
        })

        // recent 更新是“保存成功后的附属动作”，失败不应逆转主保存结论。
        // recent 持久化只是附属副作用，不能反过来决定“主文档是否保存成功”，
        // 也不能继续阻塞 save.succeeded / close-auto-save 的主链路完成。
        // 因此这里改成“写盘成功后异步补做”，主链路只保证尽力发起，不等待其完成。
        Promise.resolve()
          .then(async () => {
            try {
              await recentStore.add(effect.job.path)
            } catch {
              // 这里故意吞掉 recent 写入异常：
              // 主保存真相已经落地，recent 失败只能视为附属副作用失败。
            }
          })
          .catch(() => {})

        // 某些场景下，保存成功后需要重绑 watcher。
        // 例如首次保存新文件时，监听目标路径可能已经发生变化。
        if (shouldRebindExternalWatchAfterSave(externalWatchController)) {
          const watchContext = getExternalWatchContext(externalWatchController)
          const bindingToken = Number.isFinite(watchContext.bindingToken)
            ? watchContext.bindingToken
            : null
          const watchingPath = watchContext.watchingPath || effect.job.path

          try {
            if (typeof externalWatchController?.start !== 'function') {
              throw new TypeError('external watch controller not configured')
            }

            const rebindResult = await externalWatchController.start({
              bindingToken,
              watchingPath,
            })

            if (rebindResult === false || rebindResult?.ok === false) {
              throw rebindResult?.error || new Error('watch rebind failed')
            }

            // 成功重绑后，把这次写盘内容标记为内部写入，
            // 避免 watcher 立刻把刚刚自己的保存又识别成外部变更。
            externalWatchController.markInternalSave?.(effect.job.content)
            await dispatchCommand?.('watch.bound', {
              bindingToken,
              watchingPath: rebindResult?.watchingPath || watchingPath,
              watchingDirectoryPath: getWatchingDirectoryPath(rebindResult, watchingPath),
            })
          } catch (error) {
            await dispatchCommand?.('watch.rebind-failed', {
              bindingToken,
              watchingPath,
              error: serializeError(error),
            })
          }
        }
        return null

      case 'execute-copy-save':
        // “保存副本”与本体保存不同：
        // 它不影响当前文档身份，只需要把结果回流给 copy-save 状态机。
        try {
          await fsModule.writeFile(effect.job.path, effect.job.content)
          await dispatchCommand('copy-save.succeeded', {
            jobId: effect.job.jobId,
            requestId: effect.job.requestId,
            path: effect.job.path,
          })
        } catch (error) {
          await dispatchCommand('copy-save.failed', {
            jobId: effect.job.jobId,
            requestId: effect.job.requestId,
            reason: 'write-failed',
            path: effect.job.path,
            error,
          })
        }
        return null

      case 'open-save-dialog': {
        // 这里不自己弹 Electron dialog，而是委托外层环境提供“选定保存路径”的能力。
        // 这样 effect 层既可复用于真实桌面环境，也能在测试里用假实现驱动。
        const selectedPath = getSaveDialogTarget?.() || null
        if (selectedPath) {
          return await dispatchCommand('dialog.save-target-selected', {
            path: selectedPath,
          })
        }
        return await dispatchCommand('dialog.save-target-cancelled')
      }

      case 'open-copy-dialog': {
        // 副本保存对话框与本体保存对话框分离，
        // 并且必须把 requestId 带回命令层，确保选择结果匹配到正确请求。
        const selectedPath = getCopyDialogTarget?.() || null
        if (selectedPath) {
          return await dispatchCommand('dialog.copy-target-selected', {
            path: selectedPath,
            requestId: effect.requestId,
          })
        }
        return await dispatchCommand('dialog.copy-target-cancelled', {
          requestId: effect.requestId,
        })
      }

      case 'dispatch-command':
        // 某些 effect 本质上只是要求命令层继续推进下一步，
        // 这里直接把嵌套命令回流，避免 effect 层自己复制状态机逻辑。
        return await dispatchCommand(effect.command?.type, effect.command?.payload)

      case 'hold-window-close':
        // “阻止当前这轮关闭”本身不需要额外副作用。
        // 它只是一个语义占位 effect，表示窗口不要立刻被外层关闭。
        return null

      case 'show-unsaved-prompt':
        // 让外层窗口 UI 展示未保存确认提示。
        showUnsavedPrompt?.()
        return null

      case 'close-window':
        // 真正继续执行关闭窗口。
        // 命令层已经完成所有保存/确认裁决，这里只负责落地动作。
        return await closeHostController?.continueWindowClose?.()

      case 'notify-save-failed':
        // 统一展示保存失败消息，文案由 trigger 和语言配置共同决定。
        showSaveFailedMessage?.({
          type: 'error',
          content: getFailedSaveMessage(effect.trigger, effect.error),
        })
        return null

      case 'notify-watch-warning':
        // watcher 警告通过统一窗口消息入口展示。
        publishWindowMessage(windowMessageController, getWatchWarningMessage(effect))
        return null

      case 'notify-external-change':
        return notifyExternalChange(effect, {
          focusWindow,
          windowMessageController,
        })

      case 'rebind-watch':
        {
          // 单独的 watcher 重绑 effect，和“保存成功后顺带重绑”复用同一套回流协议：
          // 成功回流 watch.bound，失败回流 watch.rebind-failed。
          const watchingPath = effect.watchingPath || null
          try {
            if (typeof externalWatchController?.start !== 'function') {
              throw new TypeError('external watch controller not configured')
            }

            const rebindResult = await externalWatchController.start({
              bindingToken: effect.bindingToken,
              watchingPath,
            })

            if (rebindResult === false || rebindResult?.ok === false) {
              throw rebindResult?.error || new Error('watch rebind failed')
            }

            await dispatchCommand?.('watch.bound', {
              bindingToken: effect.bindingToken,
              watchingPath: rebindResult?.watchingPath || watchingPath,
              watchingDirectoryPath: getWatchingDirectoryPath(rebindResult, watchingPath),
            })
          } catch (error) {
            await dispatchCommand?.('watch.rebind-failed', {
              bindingToken: effect.bindingToken,
              watchingPath,
              error: serializeError(error),
            })
          }
        }
        return null

      default:
        // 未知 effect 默认忽略，保持 effect 执行器对前向兼容更安全。
        return null
    }
  }

  return {
    executeCommand,
    applyEffect,
    getFailedSaveMessage,
  }
}

export default {
  createDocumentEffectService,
}
