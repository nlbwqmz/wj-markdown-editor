import { dialog } from 'electron'
import fs from 'fs-extra'
import {
  isMarkdownFilePath,
  resolveDocumentOpenPath,
} from './documentOpenTargetUtil.js'

function getRecentTargetPath(payload) {
  if (typeof payload === 'string') {
    return payload
  }
  return typeof payload?.path === 'string' ? payload.path : null
}

function getOpenBaseDir(payload) {
  return typeof payload?.baseDir === 'string' && payload.baseDir.trim() !== ''
    ? payload.baseDir
    : null
}

function getLanguage(getConfig) {
  return getConfig?.()?.language || 'zh-CN'
}

async function isRegularFile(fsModule, targetPath) {
  try {
    const stat = await fsModule.stat(targetPath)
    return stat?.isFile?.() === true
  } catch {
    return false
  }
}

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

function getWatchWarningMessage(effect) {
  return {
    type: effect?.level || 'warning',
    // 当前 renderer 侧已有这条 i18n key，先统一复用，避免为了补重绑链路再扩散新的文案契约。
    content: 'message.fileExternalChangeReadFailed',
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
  recentStore = {
    add: async () => {},
    remove: async () => {},
    clear: async () => {},
    get: () => [],
  },
  getConfig = () => ({}),
}) {
  async function validateExplicitOpenTarget(targetPath, { baseDir } = {}) {
    const resolvedTargetPath = resolveDocumentOpenPath(targetPath, { baseDir })

    if (!resolvedTargetPath) {
      return {
        ok: false,
        reason: 'open-target-missing',
        path: null,
      }
    }
    if (!await fsModule.pathExists(resolvedTargetPath)) {
      return {
        ok: false,
        reason: 'open-target-missing',
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
    return {
      ok: true,
      path: resolvedTargetPath,
    }
  }

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

  async function executeCommand({
    command,
    payload,
    winInfo,
    dispatchCommand,
    openDocumentWindow,
    getSessionSnapshot,
  }) {
    switch (command) {
      case 'document.request-open-dialog': {
        const filePathList = dialogApi.showOpenDialogSync({
          title: 'Open Markdown File',
          properties: ['openFile'],
          filters: [
            { name: 'markdown file', extensions: ['md'] },
          ],
        })
        if (filePathList && filePathList.length > 0) {
          return await dispatchCommand?.('dialog.open-target-selected', {
            path: filePathList[0],
          })
        }
        return await dispatchCommand?.('dialog.open-target-cancelled')
      }

      case 'dialog.open-target-selected': {
        const targetPath = getRecentTargetPath(payload)
        const validationResult = await validateExplicitOpenTarget(targetPath, {
          baseDir: getOpenBaseDir(payload),
        })
        if (validationResult.ok !== true) {
          return validationResult
        }
        return await openDocumentWindow?.(validationResult.path, {
          isRecent: false,
          trigger: 'user',
        })
      }

      case 'document.open-path': {
        const targetPath = getRecentTargetPath(payload)
        const trigger = payload?.trigger || 'user'
        const validationResult = await validateExplicitOpenTarget(targetPath, {
          baseDir: getOpenBaseDir(payload),
        })
        if (validationResult.ok !== true) {
          return validationResult
        }
        return await openDocumentWindow?.(validationResult.path, {
          isRecent: false,
          trigger,
        })
      }

      case 'dialog.open-target-cancelled':
        return {
          ok: false,
          reason: 'cancelled',
          path: null,
        }

      case 'document.open-recent': {
        const targetPath = getRecentTargetPath(payload)
        const trigger = payload?.trigger || 'user'
        const resolvedTargetPath = resolveDocumentOpenPath(targetPath, {
          baseDir: getOpenBaseDir(payload),
        })

        if (!resolvedTargetPath) {
          return {
            ok: false,
            reason: 'recent-missing',
            path: null,
          }
        }

        const exists = await fsModule.pathExists(resolvedTargetPath)
        if (!exists && trigger === 'user') {
          return {
            ok: false,
            reason: 'recent-missing',
            path: resolvedTargetPath,
          }
        }
        if (exists && !isMarkdownFilePath(resolvedTargetPath)) {
          return {
            ok: false,
            reason: 'open-target-invalid-extension',
            path: resolvedTargetPath,
          }
        }
        if (exists && !await isRegularFile(fsModule, resolvedTargetPath)) {
          return {
            ok: false,
            reason: 'open-target-not-file',
            path: resolvedTargetPath,
          }
        }

        return await openDocumentWindow?.(resolvedTargetPath, {
          isRecent: true,
          trigger,
        })
      }

      case 'document.get-session-snapshot':
        return getSessionSnapshot?.(winInfo) || null

      case 'recent.get-list':
        return recentStore.get()

      case 'recent.remove': {
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

      default:
        throw new Error(`未知副作用命令: ${command}`)
    }
  }

  async function applyEffect({
    effect,
    winInfo: _winInfo,
    dispatchCommand,
    getSaveDialogTarget,
    getCopyDialogTarget,
    continueWindowClose,
    showUnsavedPrompt,
    showSaveFailedMessage,
    showWindowMessage,
    shouldRebindExternalWatchAfterSave,
    getExternalWatchContext,
    startExternalWatch,
    markInternalSave,
  }) {
    if (!effect) {
      return null
    }

    switch (effect.type) {
      case 'execute-save':
        // 保存任务的 started / succeeded / failed 必须全部回流命令层，
        // 这样状态推进、快照广播和迟到 effect 过滤才能共享同一套裁决。
        await dispatchCommand('save.started', {
          jobId: effect.job.jobId,
        })
        try {
          await fsModule.writeFile(effect.job.path, effect.job.content)
        } catch (error) {
          await dispatchCommand('save.failed', {
            ...effect.job,
            error,
          })
          return null
        }

        await dispatchCommand('save.succeeded', {
          ...effect.job,
          savedAt: Date.now(),
          stat: null,
        })

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

        if (shouldRebindExternalWatchAfterSave?.() === true) {
          const watchContext = getExternalWatchContext?.() || {}
          const bindingToken = Number.isFinite(watchContext.bindingToken)
            ? watchContext.bindingToken
            : null
          const watchingPath = watchContext.watchingPath || effect.job.path

          try {
            const rebindResult = await startExternalWatch?.({
              bindingToken,
              watchingPath,
            })

            if (rebindResult === false || rebindResult?.ok === false) {
              throw rebindResult?.error || new Error('watch rebind failed')
            }

            markInternalSave?.(effect.job.content)
            await dispatchCommand?.('watch.bound', {
              bindingToken,
              watchingPath: rebindResult?.watchingPath || watchingPath,
              watchingDirectoryPath: rebindResult?.watchingDirectoryPath || null,
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
        const selectedPath = getSaveDialogTarget?.() || null
        if (selectedPath) {
          return await dispatchCommand('dialog.save-target-selected', {
            path: selectedPath,
          })
        }
        return await dispatchCommand('dialog.save-target-cancelled')
      }

      case 'open-copy-dialog': {
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
        return await dispatchCommand(effect.command?.type, effect.command?.payload)

      case 'hold-window-close':
        return null

      case 'show-unsaved-prompt':
        showUnsavedPrompt?.()
        return null

      case 'close-window':
        continueWindowClose?.()
        return null

      case 'notify-save-failed':
        showSaveFailedMessage?.({
          type: 'error',
          content: getFailedSaveMessage(effect.trigger, effect.error),
        })
        return null

      case 'notify-watch-warning':
        showWindowMessage?.(getWatchWarningMessage(effect))
        return null

      case 'rebind-watch':
        {
          const watchingPath = effect.watchingPath || null
          try {
            const rebindResult = await startExternalWatch?.({
              bindingToken: effect.bindingToken,
              watchingPath,
            })

            if (rebindResult === false || rebindResult?.ok === false) {
              throw rebindResult?.error || new Error('watch rebind failed')
            }

            await dispatchCommand?.('watch.bound', {
              bindingToken: effect.bindingToken,
              watchingPath: rebindResult?.watchingPath || watchingPath,
              watchingDirectoryPath: rebindResult?.watchingDirectoryPath || null,
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
