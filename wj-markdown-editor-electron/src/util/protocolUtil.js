import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol, session } from 'electron'
import commonUtil from './commonUtil.js'
import windowLifecycleService from './document-session/windowLifecycleService.js'

let headerHookInitialized = false

/**
 * 检查文件类型是否允许通过协议访问。
 *
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否允许通过协议访问该文件
 */
function isAllowedFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const allowedExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.bmp',
    '.ico',
    '.mp4',
    '.webm',
    '.ogg',
    '.mov',
    '.avi',
    '.mkv',
    '.mp3',
    '.wav',
    '.m4a',
    '.flac',
    '.aac',
    '.md',
    '.txt',
    '.pdf',
  ]

  return allowedExtensions.includes(ext)
}

/**
 * 根据扩展名获取 MIME 类型。
 *
 * @param {string} filePath 文件路径
 * @returns {string} 对应的 MIME 类型
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
  }

  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * 处理音视频的 Range 请求。
 *
 * @param {string} filePath 文件绝对路径
 * @param {string} rangeHeader Range 请求头
 * @returns {Promise<Response>} 供协议层直接返回的范围响应
 */
async function handleRangeRequest(filePath, rangeHeader) {
  try {
    const stat = await fs.promises.stat(filePath)
    const fileSize = stat.size
    const parts = rangeHeader.replace(/bytes=/, '').split('-')
    const start = Number.parseInt(parts[0], 10)
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= fileSize || start > end) {
      console.warn('[Protocol] Invalid range:', {
        range: rangeHeader,
        start,
        end,
        fileSize,
      })
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
        },
      })
    }

    const chunkSize = (end - start) + 1
    const stream = fs.createReadStream(filePath, { start, end })

    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize.toString(),
        'Content-Type': getMimeType(filePath),
      },
    })
  } catch (error) {
    console.error('[Protocol] Range request error:', {
      path: filePath,
      range: rangeHeader,
      error: error.message,
    })

    if (error.code === 'ENOENT') {
      return new Response('Not Found', { status: 404 })
    }
    if (error.code === 'EACCES') {
      return new Response('Forbidden', { status: 403 })
    }
    return new Response('Internal Server Error', { status: 500 })
  }
}

/**
 * 初始化请求头钩子，为协议请求注入窗口 ID。
 */
function initHeaderHook() {
  if (headerHookInitialized) {
    return
  }

  try {
    headerHookInitialized = true
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      try {
        const requestHeaders = details.requestHeaders || {}
        if (details.url.startsWith('wj:')) {
          const winInfo = windowLifecycleService.getByWebContentsId(details.webContentsId)
          if (winInfo) {
            requestHeaders['X-Window-ID'] = winInfo.id
          }
        }
        callback({ requestHeaders })
      } catch (error) {
        console.error('[Protocol] Error in header hook:', error)
        callback({ requestHeaders: details.requestHeaders || {} })
      }
    })
  } catch (error) {
    console.error('[Protocol] Failed to initialize header hook:', error)
    headerHookInitialized = false
    throw error
  }
}

export default {
  handleProtocol: () => {
    try {
      initHeaderHook()

      protocol.handle('wj', async (request) => {
        const startTime = Date.now()
        let decodedUrl = null

        try {
          try {
            decodedUrl = commonUtil.decodeWjUrl(request.url)
          } catch (decodeError) {
            console.error('[Protocol] Failed to decode URL path:', {
              url: request.url,
              error: decodeError.message,
            })
            return new Response('Bad Request: Invalid URL encoding', { status: 400 })
          }

          let resolvedPath
          if (path.isAbsolute(decodedUrl)) {
            resolvedPath = decodedUrl
          } else {
            const windowId = request.headers.get('X-Window-ID')
            const winInfo = windowLifecycleService.getWinInfo(windowId)
            const documentContext = winInfo ? windowLifecycleService.getDocumentContext(winInfo) : null

            if (!documentContext?.path) {
              console.warn('[Protocol] Cannot resolve relative path without window context:', {
                decodedPath: decodedUrl,
                windowId,
                hasWinInfo: !!winInfo,
                hasPath: Boolean(documentContext?.path),
              })
              return new Response('Not Found: No document context for relative path', { status: 404 })
            }

            const basePath = path.dirname(documentContext.path)
            resolvedPath = path.resolve(basePath, decodedUrl)
          }

          if (!fs.existsSync(resolvedPath)) {
            console.warn('[Protocol] File not found:', resolvedPath)
            return new Response('Not Found: File does not exist', { status: 404 })
          }

          if (!isAllowedFileType(resolvedPath)) {
            console.warn('[Protocol] File type not allowed:', {
              path: resolvedPath,
              extension: path.extname(resolvedPath),
            })
            return new Response('Forbidden: File type not allowed', { status: 403 })
          }

          const rangeHeader = request.headers.get('Range')
          if (rangeHeader) {
            return await handleRangeRequest(resolvedPath, rangeHeader)
          }

          const fileUrl = pathToFileURL(resolvedPath).toString()
          return net.fetch(fileUrl).catch((fetchError) => {
            console.error('[Protocol] File fetch failed:', {
              path: resolvedPath,
              error: fetchError.message,
              code: fetchError.code,
            })

            if (fetchError.code === 'ENOENT' || fetchError.message.includes('not found')) {
              return new Response('Not Found: File does not exist', { status: 404 })
            }
            if (fetchError.code === 'EACCES' || fetchError.message.includes('permission')) {
              return new Response('Forbidden: Permission denied', { status: 403 })
            }
            return new Response('Internal Server Error: Failed to read file', { status: 500 })
          })
        } catch (error) {
          console.error('[Protocol] Error handling wj:// request:', {
            url: request.url,
            decodedPath: decodedUrl,
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
            processingTime: `${Date.now() - startTime}ms`,
          })
          return new Response('Internal Server Error: Request processing failed', { status: 500 })
        }
      })
    } catch (error) {
      console.error('[Protocol] CRITICAL: Failed to register wj:// protocol handler')
      console.error('[Protocol] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
      console.error('[Protocol] Local file access will not work. Application functionality severely limited.')
      throw new Error(`Protocol handler registration failed: ${error.message}`)
    }
  },
}
