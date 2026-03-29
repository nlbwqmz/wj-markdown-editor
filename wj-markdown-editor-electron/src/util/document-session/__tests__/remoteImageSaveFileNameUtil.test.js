import { describe, expect, it, vi } from 'vitest'
import {
  buildRemoteSaveFileName,
  createRemoteImageSaveMetadataProbe,
  deriveRemoteFileNameFromUrl,
  isReliableRemoteImageFileName,
  parseContentDispositionFileName,
  sanitizeRemoteFileNamePart,
} from '../remoteImageSaveFileNameUtil.js'

describe('remoteImageSaveFileNameUtil', () => {
  it('sanitizeRemoteFileNamePart 应移除非法字符、尾随空格和点，并在保留设备名时回退到 image', () => {
    expect(sanitizeRemoteFileNamePart('封/面:图*片?. ')).toBe('封面图片')
    expect(sanitizeRemoteFileNamePart('CON. ')).toBe('image')
  })

  it('sanitizeRemoteFileNamePart 应移除 Windows 控制字符', () => {
    expect(sanitizeRemoteFileNamePart('foo\nbar')).toBe('foobar')
  })

  it('deriveRemoteFileNameFromUrl 应从 URL pathname 中提取并清洗文件名', () => {
    expect(deriveRemoteFileNameFromUrl(
      'https://example.com/assets/%E5%B0%81%E9%9D%A2.JPG?download=1#hash',
    )).toBe('封面.jpg')
  })

  it('buildRemoteSaveFileName 应将非图片扩展名替换为默认扩展名', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'demo.php',
      headerFileName: null,
      contentType: null,
    })).toBe('demo.png')
  })

  it('isReliableRemoteImageFileName 对大小写扩展名必须大小写不敏感', () => {
    expect(isReliableRemoteImageFileName('cover.JPG')).toBe(true)
    expect(isReliableRemoteImageFileName('cover.JPEG')).toBe(true)
  })

  it('isReliableRemoteImageFileName 应识别 png、webp 和 avif 为可靠图片文件名', () => {
    expect(isReliableRemoteImageFileName('cover.png')).toBe(true)
    expect(isReliableRemoteImageFileName('cover.webp')).toBe(true)
    expect(isReliableRemoteImageFileName('cover.avif')).toBe(true)
  })

  it('isReliableRemoteImageFileName 对空名、点文件名、无扩展名和非图片扩展名应返回 false', () => {
    expect(isReliableRemoteImageFileName('')).toBe(false)
    expect(isReliableRemoteImageFileName('.')).toBe(false)
    expect(isReliableRemoteImageFileName('.png')).toBe(false)
    expect(isReliableRemoteImageFileName('cover')).toBe(false)
    expect(isReliableRemoteImageFileName('cover.txt')).toBe(false)
  })

  it('buildRemoteSaveFileName 在 Windows 保留名场景下应回退到 image.jpg', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'CON.jpg',
      headerFileName: null,
      contentType: null,
    })).toBe('image.jpg')
  })

  it('buildRemoteSaveFileName 对大小写不同的 Windows 保留名也应回退到 image.jpg', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'CoN.jpg',
      headerFileName: null,
      contentType: null,
    })).toBe('image.jpg')
  })

  it('buildRemoteSaveFileName 在 PRN 这类 Windows 保留名场景下也应回退到 image.jpg', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'PRN.jpg',
      headerFileName: null,
      contentType: null,
    })).toBe('image.jpg')
  })

  it('buildRemoteSaveFileName 在 COM1 这类 Windows 设备名场景下也应回退到 image.jpg', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'COM1.jpg',
      headerFileName: null,
      contentType: null,
    })).toBe('image.jpg')
  })

  it('buildRemoteSaveFileName 应去除文件名尾随空格和点', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: '封面.png. ',
      headerFileName: null,
      contentType: null,
    })).toBe('封面.png')
  })

  it('buildRemoteSaveFileName 应将图片扩展名统一为小写', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: '封面.PNG',
      headerFileName: null,
      contentType: null,
    })).toBe('封面.png')
  })

  it('buildRemoteSaveFileName 应优先使用 header 文件名基础名，再用 content-type 补扩展名', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'download',
      headerFileName: 'photo',
      contentType: 'image/avif',
    })).toBe('photo.avif')
  })

  it('buildRemoteSaveFileName 在只有 content-type 可用时，应生成 image.webp', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: '',
      headerFileName: null,
      contentType: 'image/webp',
    })).toBe('image.webp')
  })

  it('buildRemoteSaveFileName 在没有 header 文件名时，应复用 URL basename 并允许 content-type 覆盖扩展名', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'cover.webp',
      headerFileName: null,
      contentType: 'image/png',
    })).toBe('cover.png')
  })

  it('buildRemoteSaveFileName 在 header 自带合法图片扩展名时，应优先于 content-type 和 URL 扩展名', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'cover.png',
      headerFileName: 'photo.JPG',
      contentType: 'image/avif',
    })).toBe('photo.jpg')
  })

  it('buildRemoteSaveFileName 在 header 给出非图片扩展名但 basename 可复用时，应复用 basename 并按 content-type 修正扩展名', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'cover.png',
      headerFileName: 'photo.php',
      contentType: 'image/avif',
    })).toBe('photo.avif')
  })

  it('buildRemoteSaveFileName 在选中 header 文件名时，也应清洗非法字符、尾随空格和点', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'cover.png',
      headerFileName: '封/面:图*片?.PNG. ',
      contentType: 'image/avif',
    })).toBe('封面图片.png')
  })

  it('buildRemoteSaveFileName 在 header basename 不可用时，应复用 URL basename 并按 content-type 选择扩展名', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'cover.webp',
      headerFileName: 'download',
      contentType: 'image/avif',
    })).toBe('cover.avif')
  })

  it('buildRemoteSaveFileName 在 header 基础名因保留名不可用时，应回退到 URL basename 并允许 content-type 修正扩展名', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: 'cover.webp',
      headerFileName: 'CON.png',
      contentType: 'image/avif',
    })).toBe('cover.avif')
  })

  it('buildRemoteSaveFileName 应移除路径分隔符和 Windows 非法字符', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: '封/面:图*片?.png',
      headerFileName: null,
      contentType: null,
    })).toBe('封面图片.png')
  })

  it('buildRemoteSaveFileName 在清洗后 basename 为空时，应回退到 image.jpg', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: '<>:\"/\\\\|?*.png',
      headerFileName: null,
      contentType: 'image/jpeg',
    })).toBe('image.jpg')
  })

  it('buildRemoteSaveFileName 在 URL 与 header 都不给 basename 时，应回退到 image.png', () => {
    expect(buildRemoteSaveFileName({
      urlFileName: '',
      headerFileName: '',
      contentType: null,
    })).toBe('image.png')
  })

  it('parseContentDispositionFileName 应优先 filename*', () => {
    expect(parseContentDispositionFileName(
      'attachment; filename=plain.png; filename*=UTF-8\'\'%E5%B0%81%E9%9D%A2.webp',
    )).toBe('封面.webp')
  })

  it('parseContentDispositionFileName 在只有 filename= 时应返回文件名', () => {
    expect(parseContentDispositionFileName(
      'attachment; filename="cover.png"',
    )).toBe('cover.png')
  })

  it('parseContentDispositionFileName 在 filename= 未加引号时也应返回文件名', () => {
    expect(parseContentDispositionFileName(
      'attachment; filename=cover.png',
    )).toBe('cover.png')
  })

  it('parseContentDispositionFileName 在 filename*= 损坏但 filename= 可用时，应回退到 filename=', () => {
    expect(parseContentDispositionFileName(
      'attachment; filename="cover.png"; filename*=UTF-8\'\'%E5%B0%81%E9%9D%A2%E0%A4',
    )).toBe('cover.png')
  })

  it('parseContentDispositionFileName 在坏编码输入下应静默返回 null', () => {
    expect(parseContentDispositionFileName(
      'attachment; filename*=UTF-8\'\'%E5%B0%81%E9%9D%A2%E0%A4',
    )).toBe(null)
  })

  it('createRemoteImageSaveMetadataProbe 在 HEAD 成功时应只返回文件名与 content-type', async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        headers: {
          get(name) {
            if (name === 'content-disposition') {
              return 'attachment; filename*=UTF-8\'\'%E5%B0%81%E9%9D%A2.webp'
            }
            if (name === 'content-type') {
              return 'image/webp; charset=utf-8'
            }
            return null
          },
        },
        get body() {
          throw new Error('probe 不应访问响应体')
        },
      }
    })

    const probe = createRemoteImageSaveMetadataProbe({
      fetchImpl,
      timeoutMs: 120,
    })

    await expect(probe('https://example.com/assets/demo')).resolves.toEqual({
      ok: true,
      fileName: '封面.webp',
      contentType: 'image/webp',
    })
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/assets/demo', expect.objectContaining({
      method: 'HEAD',
      signal: expect.any(AbortSignal),
    }))
  })

  it('createRemoteImageSaveMetadataProbe 应使用独立注入的超时预算静默回退', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn((_url, options) => {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          }, { once: true })
        })
      })

      const probe = createRemoteImageSaveMetadataProbe({
        fetchImpl,
        timeoutMs: 25,
      })

      const resultPromise = probe('https://example.com/assets/demo')
      await vi.advanceTimersByTimeAsync(25)

      await expect(resultPromise).resolves.toEqual({
        ok: false,
      })
      expect(fetchImpl).toHaveBeenCalledWith('https://example.com/assets/demo', expect.objectContaining({
        method: 'HEAD',
        signal: expect.any(AbortSignal),
      }))
    } finally {
      vi.useRealTimers()
    }
  })
})
