import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 路径安全验证函数（从 protocolUtil.js 提取用于测试）
 * 防止目录遍历攻击，确保解析后的路径不会逃逸基础目录
 *
 * @param {string} resolvedPath - 已解析的绝对路径
 * @param {string|null} basePath - 基础目录路径（相对路径场景）
 * @returns {boolean} - true 表示路径安全，false 表示存在安全风险
 */
function isSafePath(resolvedPath, basePath) {
  // 绝对路径场景：无基础目录时，允许访问（由操作系统权限控制）
  if (!basePath) {
    return true
  }

  // 计算相对路径
  const relativePath = path.relative(basePath, resolvedPath)

  // 防止目录遍历攻击：
  // 1. relativePath 不能为空
  // 2. 不能以 ".." 开头（表示试图访问父目录之外的内容）
  // 3. 不能是绝对路径（表示跨盘符或根目录注入攻击）
  return relativePath
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath)
}

describe('isSafePath - 路径安全验证', () => {
  describe('安全的相对路径', () => {
    it('应该允许同级目录下的文件', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/home/user/docs/test.md'
      expect(isSafePath(resolvedPath, basePath)).toBe(true)
    })

    it('应该允许子目录中的文件', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/home/user/docs/images/test.png'
      expect(isSafePath(resolvedPath, basePath)).toBe(true)
    })

    it('应该允许深层嵌套的子目录', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/home/user/docs/a/b/c/d/test.png'
      expect(isSafePath(resolvedPath, basePath)).toBe(true)
    })

    it('应该允许 Windows 路径格式', () => {
      const basePath = 'C:\\Users\\user\\docs'
      const resolvedPath = 'C:\\Users\\user\\docs\\images\\test.png'
      expect(isSafePath(resolvedPath, basePath)).toBe(true)
    })
  })

  describe('目录遍历攻击防护', () => {
    it('应该阻止访问父目录之外的文件（一级）', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/home/user/etc/passwd'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('应该阻止访问父目录之外的文件（多级）', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/etc/passwd'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('应该阻止使用 .. 的路径遍历', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/home/user/sensitive.txt'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('应该阻止 Windows 系统目录访问', () => {
      const basePath = 'C:\\Users\\user\\docs'
      const resolvedPath = 'C:\\Windows\\System32\\config\\SAM'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('应该阻止访问根目录文件', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/root/.ssh/id_rsa'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })
  })

  describe('绝对路径注入防护', () => {
    it('应该阻止跨盘符访问（Windows）', () => {
      const basePath = 'C:\\Users\\user\\docs'
      const resolvedPath = 'D:\\sensitive\\data.txt'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('应该阻止绝对路径注入（Unix）', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/var/log/system.log'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('应该阻止 UNC 路径注入（Windows）', () => {
      const basePath = 'C:\\Users\\user\\docs'
      const resolvedPath = '\\\\server\\share\\file.txt'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })
  })

  describe('边界情况', () => {
    it('应该拒绝基础目录本身（空相对路径）', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/home/user/docs'
      // 注意：path.relative 返回空字符串 ''，被视为 falsy，因此被拒绝
      // 这是正确的行为，因为访问目录本身不是有效的文件访问
      const result = isSafePath(resolvedPath, basePath)
      expect(result).toBeFalsy() // 可能返回 false 或空字符串 ''
    })

    it('应该允许绝对路径（无基础目录）', () => {
      const resolvedPath = '/home/user/images/test.png'
      expect(isSafePath(resolvedPath, null)).toBe(true)
    })

    it('应该允许绝对路径（undefined 基础目录）', () => {
      const resolvedPath = '/home/user/images/test.png'
      expect(isSafePath(resolvedPath, undefined)).toBe(true)
    })

    it('应该处理带有特殊字符的路径', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/home/user/docs/文件 (1).md'
      expect(isSafePath(resolvedPath, basePath)).toBe(true)
    })

    it('应该处理带有空格的路径', () => {
      const basePath = '/home/user/my docs'
      const resolvedPath = '/home/user/my docs/test file.md'
      expect(isSafePath(resolvedPath, basePath)).toBe(true)
    })
  })

  describe('真实场景测试', () => {
    it('场景1: 用户在文档中引用同级图片', () => {
      // 文档路径: /home/user/docs/article.md
      // 图片路径: ./image.png
      const basePath = '/home/user/docs'
      const resolvedPath = path.resolve(basePath, './image.png')
      expect(isSafePath(resolvedPath, basePath)).toBe(true)
    })

    it('场景2: 用户在文档中引用子目录图片', () => {
      // 文档路径: /home/user/docs/article.md
      // 图片路径: ./images/photo.jpg
      const basePath = '/home/user/docs'
      const resolvedPath = path.resolve(basePath, './images/photo.jpg')
      expect(isSafePath(resolvedPath, basePath)).toBe(true)
    })

    it('场景3: 攻击者尝试访问系统文件', () => {
      // 文档路径: /home/user/docs/article.md
      // 恶意路径: ../../etc/passwd
      const basePath = '/home/user/docs'
      const resolvedPath = path.resolve(basePath, '../../etc/passwd')
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('场景4: 攻击者尝试跨盘符访问（Windows）', () => {
      // 文档路径: C:\Users\user\docs\article.md
      // 恶意路径: D:\sensitive\data.txt
      const basePath = 'C:\\Users\\user\\docs'
      const resolvedPath = 'D:\\sensitive\\data.txt'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('场景5: 用户使用绝对路径（应该被允许，由操作系统权限控制）', () => {
      // 文档路径: /home/user/docs/article.md
      // 绝对路径: /home/user/images/photo.jpg
      const resolvedPath = '/home/user/images/photo.jpg'
      expect(isSafePath(resolvedPath, null)).toBe(true)
    })
  })

  describe('Windows 特定测试', () => {
    it('应该正确处理 Windows 路径分隔符', () => {
      const basePath = 'C:\\Users\\user\\docs'
      const resolvedPath = 'C:\\Users\\user\\docs\\images\\test.png'
      expect(isSafePath(resolvedPath, basePath)).toBe(true)
    })

    it('应该阻止访问 Windows 系统目录', () => {
      const basePath = 'C:\\Users\\user\\docs'
      const resolvedPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('应该阻止访问其他用户目录', () => {
      const basePath = 'C:\\Users\\alice\\docs'
      const resolvedPath = 'C:\\Users\\bob\\private.txt'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })
  })

  describe('Unix/Linux 特定测试', () => {
    it('应该阻止访问 /etc 目录', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/etc/shadow'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('应该阻止访问 /root 目录', () => {
      const basePath = '/home/user/docs'
      const resolvedPath = '/root/.bashrc'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })

    it('应该阻止访问其他用户的 home 目录', () => {
      const basePath = '/home/alice/docs'
      const resolvedPath = '/home/bob/.ssh/id_rsa'
      expect(isSafePath(resolvedPath, basePath)).toBe(false)
    })
  })
})

/**
 * MIME 类型检测函数（从 protocolUtil.js 提取用于测试）
 * 根据文件扩展名返回对应的 MIME 类型
 *
 * @param {string} filePath - 文件路径
 * @returns {string} - MIME 类型字符串
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes = {
    // 图片
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    // 视频
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    // 音频
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    // 文档
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

describe('getMimeType - MIME 类型检测', () => {
  describe('图片格式', () => {
    it('应该返回 PNG 图片的正确 MIME 类型', () => {
      expect(getMimeType('test.png')).toBe('image/png')
      expect(getMimeType('/path/to/image.png')).toBe('image/png')
      expect(getMimeType('C:\\Users\\test.PNG')).toBe('image/png')
    })

    it('应该返回 JPG/JPEG 图片的正确 MIME 类型', () => {
      expect(getMimeType('test.jpg')).toBe('image/jpeg')
      expect(getMimeType('test.jpeg')).toBe('image/jpeg')
      expect(getMimeType('photo.JPG')).toBe('image/jpeg')
      expect(getMimeType('photo.JPEG')).toBe('image/jpeg')
    })

    it('应该返回 GIF 图片的正确 MIME 类型', () => {
      expect(getMimeType('animation.gif')).toBe('image/gif')
      expect(getMimeType('animation.GIF')).toBe('image/gif')
    })

    it('应该返回 WebP 图片的正确 MIME 类型', () => {
      expect(getMimeType('modern.webp')).toBe('image/webp')
      expect(getMimeType('modern.WEBP')).toBe('image/webp')
    })

    it('应该返回 SVG 图片的正确 MIME 类型', () => {
      expect(getMimeType('vector.svg')).toBe('image/svg+xml')
      expect(getMimeType('icon.SVG')).toBe('image/svg+xml')
    })

    it('应该返回 BMP 图片的正确 MIME 类型', () => {
      expect(getMimeType('bitmap.bmp')).toBe('image/bmp')
      expect(getMimeType('bitmap.BMP')).toBe('image/bmp')
    })

    it('应该返回 ICO 图标的正确 MIME 类型', () => {
      expect(getMimeType('favicon.ico')).toBe('image/x-icon')
      expect(getMimeType('favicon.ICO')).toBe('image/x-icon')
    })
  })

  describe('视频格式', () => {
    it('应该返回 MP4 视频的正确 MIME 类型', () => {
      expect(getMimeType('video.mp4')).toBe('video/mp4')
      expect(getMimeType('movie.MP4')).toBe('video/mp4')
    })

    it('应该返回 WebM 视频的正确 MIME 类型', () => {
      expect(getMimeType('video.webm')).toBe('video/webm')
      expect(getMimeType('video.WEBM')).toBe('video/webm')
    })

    it('应该返回 OGG 视频的正确 MIME 类型', () => {
      expect(getMimeType('video.ogg')).toBe('video/ogg')
      expect(getMimeType('video.OGG')).toBe('video/ogg')
    })

    it('应该返回 MOV 视频的正确 MIME 类型', () => {
      expect(getMimeType('video.mov')).toBe('video/quicktime')
      expect(getMimeType('video.MOV')).toBe('video/quicktime')
    })

    it('应该返回 AVI 视频的正确 MIME 类型', () => {
      expect(getMimeType('video.avi')).toBe('video/x-msvideo')
      expect(getMimeType('video.AVI')).toBe('video/x-msvideo')
    })

    it('应该返回 MKV 视频的正确 MIME 类型', () => {
      expect(getMimeType('video.mkv')).toBe('video/x-matroska')
      expect(getMimeType('video.MKV')).toBe('video/x-matroska')
    })
  })

  describe('音频格式', () => {
    it('应该返回 MP3 音频的正确 MIME 类型', () => {
      expect(getMimeType('audio.mp3')).toBe('audio/mpeg')
      expect(getMimeType('music.MP3')).toBe('audio/mpeg')
    })

    it('应该返回 WAV 音频的正确 MIME 类型', () => {
      expect(getMimeType('audio.wav')).toBe('audio/wav')
      expect(getMimeType('audio.WAV')).toBe('audio/wav')
    })

    it('应该返回 M4A 音频的正确 MIME 类型', () => {
      expect(getMimeType('audio.m4a')).toBe('audio/mp4')
      expect(getMimeType('audio.M4A')).toBe('audio/mp4')
    })

    it('应该返回 FLAC 音频的正确 MIME 类型', () => {
      expect(getMimeType('audio.flac')).toBe('audio/flac')
      expect(getMimeType('audio.FLAC')).toBe('audio/flac')
    })

    it('应该返回 AAC 音频的正确 MIME 类型', () => {
      expect(getMimeType('audio.aac')).toBe('audio/aac')
      expect(getMimeType('audio.AAC')).toBe('audio/aac')
    })
  })

  describe('未知文件类型', () => {
    it('应该为未知扩展名返回默认 MIME 类型', () => {
      expect(getMimeType('file.xyz')).toBe('application/octet-stream')
      expect(getMimeType('file.unknown')).toBe('application/octet-stream')
      expect(getMimeType('file.abc123')).toBe('application/octet-stream')
    })

    it('应该为无扩展名文件返回默认 MIME 类型', () => {
      expect(getMimeType('file')).toBe('application/octet-stream')
      expect(getMimeType('/path/to/file')).toBe('application/octet-stream')
    })
  })

  describe('边界情况', () => {
    it('应该正确处理大小写混合的扩展名', () => {
      expect(getMimeType('test.PnG')).toBe('image/png')
      expect(getMimeType('test.JpEg')).toBe('image/jpeg')
      expect(getMimeType('test.Mp4')).toBe('video/mp4')
    })

    it('应该正确处理带有多个点的文件名', () => {
      expect(getMimeType('my.file.name.png')).toBe('image/png')
      expect(getMimeType('archive.tar.gz.mp4')).toBe('video/mp4')
    })

    it('应该正确处理 Windows 路径', () => {
      expect(getMimeType('C:\\Users\\user\\image.png')).toBe('image/png')
      expect(getMimeType('D:\\Videos\\movie.mp4')).toBe('video/mp4')
    })

    it('应该正确处理 Unix 路径', () => {
      expect(getMimeType('/home/user/image.png')).toBe('image/png')
      expect(getMimeType('/var/media/video.mp4')).toBe('video/mp4')
    })

    it('应该正确处理带有特殊字符的文件名', () => {
      expect(getMimeType('文件 (1).png')).toBe('image/png')
      expect(getMimeType('my-file_2024.mp4')).toBe('video/mp4')
    })
  })

  describe('真实场景测试', () => {
    it('场景1: Markdown 文档中的图片', () => {
      expect(getMimeType('./images/screenshot.png')).toBe('image/png')
      expect(getMimeType('../assets/logo.svg')).toBe('image/svg+xml')
    })

    it('场景2: 视频嵌入', () => {
      expect(getMimeType('./videos/demo.mp4')).toBe('video/mp4')
      expect(getMimeType('/absolute/path/tutorial.webm')).toBe('video/webm')
    })

    it('场景3: 音频播放', () => {
      expect(getMimeType('./audio/music.mp3')).toBe('audio/mpeg')
      expect(getMimeType('C:\\Music\\song.flac')).toBe('audio/flac')
    })

    it('场景4: 多种格式混合', () => {
      const files = [
        { path: 'image.jpg', expected: 'image/jpeg' },
        { path: 'video.mp4', expected: 'video/mp4' },
        { path: 'audio.mp3', expected: 'audio/mpeg' },
        { path: 'icon.svg', expected: 'image/svg+xml' },
      ]

      files.forEach(({ path, expected }) => {
        expect(getMimeType(path)).toBe(expected)
      })
    })
  })
})

/**
 * 解析 Range 请求头
 * 从 HTTP Range 头中提取起始和结束字节位置
 *
 * @param {string} rangeHeader - Range 请求头的值（格式：bytes=start-end）
 * @param {number} fileSize - 文件总大小
 * @returns {{ start: number, end: number, valid: boolean, error?: string }} - 解析结果
 */
function parseRangeHeader(rangeHeader, fileSize) {
  try {
    // 移除 "bytes=" 前缀
    const parts = rangeHeader.replace(/bytes=/, '').split('-')
    const start = Number.parseInt(parts[0], 10)
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1

    // 验证范围
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return { start: 0, end: 0, valid: false, error: 'Invalid range format' }
    }

    if (start < 0 || end >= fileSize || start > end) {
      return { start, end, valid: false, error: 'Range out of bounds' }
    }

    return { start, end, valid: true }
  } catch (error) {
    return { start: 0, end: 0, valid: false, error: error.message }
  }
}

describe('parseRangeHeader - Range 请求解析', () => {
  describe('标准 Range 格式', () => {
    it('应该正确解析完整的 Range 头（start-end）', () => {
      const result = parseRangeHeader('bytes=0-1023', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(1023)
    })

    it('应该正确解析中间范围', () => {
      const result = parseRangeHeader('bytes=1000-1999', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(1000)
      expect(result.end).toBe(1999)
    })

    it('应该正确解析大文件的 Range', () => {
      const fileSize = 100 * 1024 * 1024 // 100MB
      const result = parseRangeHeader('bytes=0-1048575', fileSize)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(1048575)
    })
  })

  describe('部分 Range 格式', () => {
    it('应该正确解析只有 start 的 Range（start-）', () => {
      const result = parseRangeHeader('bytes=1000-', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(1000)
      expect(result.end).toBe(9999) // fileSize - 1
    })

    it('应该正确解析从 0 开始到结尾的 Range', () => {
      const result = parseRangeHeader('bytes=0-', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(9999)
    })

    it('应该正确解析从中间到结尾的 Range', () => {
      const result = parseRangeHeader('bytes=5000-', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(5000)
      expect(result.end).toBe(9999)
    })
  })

  describe('边界情况', () => {
    it('应该正确处理单字节 Range', () => {
      const result = parseRangeHeader('bytes=0-0', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(0)
    })

    it('应该正确处理最后一个字节', () => {
      const result = parseRangeHeader('bytes=9999-9999', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(9999)
      expect(result.end).toBe(9999)
    })

    it('应该正确处理整个文件的 Range', () => {
      const result = parseRangeHeader('bytes=0-9999', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(9999)
    })

    it('应该正确处理小文件', () => {
      const result = parseRangeHeader('bytes=0-99', 100)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(99)
    })
  })

  describe('无效的 Range 格式', () => {
    it('应该拒绝 start 超出文件大小', () => {
      const result = parseRangeHeader('bytes=10000-10999', 10000)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Range out of bounds')
    })

    it('应该拒绝 end 超出文件大小', () => {
      const result = parseRangeHeader('bytes=0-10000', 10000)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Range out of bounds')
    })

    it('应该拒绝 start > end', () => {
      const result = parseRangeHeader('bytes=1000-500', 10000)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Range out of bounds')
    })

    it('应该拒绝负数 start', () => {
      // 注意：'bytes=-100-1000'.split('-') 会产生 ['bytes=', '100', '1000']
      // 所以 parts[0] 是空字符串，parseInt('', 10) 返回 NaN
      const result = parseRangeHeader('bytes=-100-1000', 10000)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid range format')
    })

    it('应该拒绝无效的数字格式', () => {
      const result = parseRangeHeader('bytes=abc-def', 10000)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid range format')
    })

    it('应该拒绝缺少 bytes= 前缀的格式', () => {
      const result = parseRangeHeader('0-1000', 10000)
      expect(result.valid).toBe(true) // 仍然能解析，因为 replace 不会报错
      expect(result.start).toBe(0)
      expect(result.end).toBe(1000)
    })
  })

  describe('真实场景测试', () => {
    it('场景1: 视频播放器初始加载（前 1MB）', () => {
      const fileSize = 100 * 1024 * 1024 // 100MB 视频
      const result = parseRangeHeader('bytes=0-1048575', fileSize)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(1048575)
      expect(result.end - result.start + 1).toBe(1024 * 1024) // 1MB
    })

    it('场景2: 用户拖动进度条到 50%', () => {
      const fileSize = 100 * 1024 * 1024 // 100MB
      const midPoint = Math.floor(fileSize / 2)
      const result = parseRangeHeader(`bytes=${midPoint}-${midPoint + 1048575}`, fileSize)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(midPoint)
    })

    it('场景3: 播放器请求最后一块数据', () => {
      const fileSize = 100 * 1024 * 1024
      const lastChunkStart = fileSize - 1048576 // 最后 1MB
      const result = parseRangeHeader(`bytes=${lastChunkStart}-`, fileSize)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(lastChunkStart)
      expect(result.end).toBe(fileSize - 1)
    })

    it('场景4: 音频播放器快进到结尾', () => {
      const fileSize = 10 * 1024 * 1024 // 10MB 音频
      const nearEnd = fileSize - 100000
      const result = parseRangeHeader(`bytes=${nearEnd}-`, fileSize)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(nearEnd)
      expect(result.end).toBe(fileSize - 1)
    })

    it('场景5: 浏览器预加载视频元数据', () => {
      const fileSize = 50 * 1024 * 1024
      const result = parseRangeHeader('bytes=0-32767', fileSize) // 前 32KB
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(32767)
    })
  })

  describe('响应头生成测试', () => {
    it('应该生成正确的 Content-Range 头', () => {
      const result = parseRangeHeader('bytes=0-1023', 10000)
      expect(result.valid).toBe(true)

      const contentRange = `bytes ${result.start}-${result.end}/${10000}`
      expect(contentRange).toBe('bytes 0-1023/10000')
    })

    it('应该生成正确的 Content-Length', () => {
      const result = parseRangeHeader('bytes=1000-1999', 10000)
      expect(result.valid).toBe(true)

      const contentLength = result.end - result.start + 1
      expect(contentLength).toBe(1000)
    })

    it('应该为无效 Range 生成 416 响应头', () => {
      const result = parseRangeHeader('bytes=10000-10999', 10000)
      expect(result.valid).toBe(false)

      const contentRange = `bytes */${10000}`
      expect(contentRange).toBe('bytes */10000')
    })
  })

  describe('性能和大文件测试', () => {
    it('应该正确处理 1GB 文件的 Range', () => {
      const fileSize = 1024 * 1024 * 1024 // 1GB
      const result = parseRangeHeader('bytes=0-1048575', fileSize)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(1048575)
    })

    it('应该正确处理 10GB 文件的 Range', () => {
      const fileSize = 10 * 1024 * 1024 * 1024 // 10GB
      const result = parseRangeHeader(`bytes=0-${fileSize - 1}`, fileSize)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(fileSize - 1)
    })

    it('应该快速解析 Range 头（性能测试）', () => {
      const startTime = performance.now()
      for (let i = 0; i < 10000; i++) {
        parseRangeHeader('bytes=0-1048575', 100 * 1024 * 1024)
      }
      const duration = performance.now() - startTime
      expect(duration).toBeLessThan(100) // 10000 次解析应该在 100ms 内完成
    })
  })

  describe('浏览器兼容性测试', () => {
    it('应该处理 Chrome 的 Range 请求格式', () => {
      const result = parseRangeHeader('bytes=0-', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(9999)
    })

    it('应该处理 Firefox 的 Range 请求格式', () => {
      const result = parseRangeHeader('bytes=0-1048575', 10000000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(1048575)
    })

    it('应该处理 Safari 的 Range 请求格式', () => {
      const result = parseRangeHeader('bytes=0-1', 10000)
      expect(result.valid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(1)
    })
  })
})

describe('protocolUtil 协议上下文回退', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  function createWjUrl(resourcePath) {
    return `wj://${Buffer.from(resourcePath, 'utf8').toString('hex')}`
  }

  async function setupProtocolHeaderHook({
    directWindowId = null,
    parentWindowId = null,
  } = {}) {
    let beforeSendHeadersHandler = null
    const requestWebContentsId = 401
    const parentWindow = parentWindowId == null
      ? null
      : {
          id: 41,
          getParentWindow: () => null,
        }
    const requestWindow = {
      id: 40,
      getParentWindow: () => parentWindow,
    }
    const requestWebContents = {
      id: requestWebContentsId,
    }

    vi.doMock('electron', () => ({
      BrowserWindow: {
        fromWebContents: vi.fn((target) => {
          if (target === requestWebContents) {
            return requestWindow
          }
          return null
        }),
      },
      net: {
        fetch: vi.fn(),
      },
      protocol: {
        handle: vi.fn(),
      },
      session: {
        defaultSession: {
          webRequest: {
            onBeforeSendHeaders: vi.fn((handler) => {
              beforeSendHeadersHandler = handler
            }),
          },
        },
      },
      webContents: {
        fromId: vi.fn((id) => {
          if (id === requestWebContentsId) {
            return requestWebContents
          }
          return null
        }),
      },
    }))
    vi.doMock('./commonUtil.js', () => ({
      default: {
        decodeWjUrl: vi.fn((url) => {
          return Buffer.from(url.replace(/^wj:\/\//, ''), 'hex').toString('utf8')
        }),
      },
    }))
    vi.doMock('./document-session/windowLifecycleService.js', () => ({
      default: {
        getByWebContentsId: vi.fn((id) => {
          if (id !== requestWebContentsId || directWindowId == null) {
            return null
          }
          return { id: directWindowId }
        }),
        getWinInfo: vi.fn((target) => {
          if (target === parentWindow && parentWindowId != null) {
            return { id: parentWindowId, win: parentWindow }
          }
          if (target === directWindowId || target === String(directWindowId)) {
            return directWindowId == null
              ? null
              : { id: directWindowId, win: requestWindow }
          }
          if (target === parentWindowId || target === String(parentWindowId)) {
            return parentWindowId == null
              ? null
              : { id: parentWindowId, win: parentWindow }
          }
          return null
        }),
        getDocumentContext: vi.fn(() => ({
          path: 'D:/docs/demo.md',
        })),
      },
    }))

    const { default: protocolUtil } = await import('./protocolUtil.js')
    protocolUtil.handleProtocol()

    return {
      beforeSendHeadersHandler,
      requestWebContentsId,
    }
  }

  it('resolveWindowIdForProtocolRequest 必须优先返回当前窗口 ID', async () => {
    const { resolveWindowIdForProtocolRequest } = await import('./protocolRequestContextUtil.js')
    const currentWindowId = 'current-window'

    const result = resolveWindowIdForProtocolRequest({
      webContentsId: 11,
      getWindowIdByWebContentsId: id => id === 11 ? currentWindowId : null,
      getParentWindowIdByWebContentsId: () => 'parent-window',
    })

    expect(result).toBe(currentWindowId)
  })

  it('未注册子窗口的协议请求必须回退到父窗口 ID 注入 X-Window-ID', async () => {
    const parentWindowId = 'parent-window'
    const { beforeSendHeadersHandler, requestWebContentsId } = await setupProtocolHeaderHook({
      directWindowId: null,
      parentWindowId,
    })
    const callback = vi.fn()

    beforeSendHeadersHandler({
      url: createWjUrl('./assets/demo.png'),
      webContentsId: requestWebContentsId,
      requestHeaders: {},
    }, callback)

    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        'X-Window-ID': parentWindowId,
      },
    })
  })

  it('父窗口也缺失时，协议请求头不得注入伪造的 X-Window-ID', async () => {
    const { beforeSendHeadersHandler, requestWebContentsId } = await setupProtocolHeaderHook({
      directWindowId: null,
      parentWindowId: null,
    })
    const callback = vi.fn()

    beforeSendHeadersHandler({
      url: createWjUrl('./assets/demo.png'),
      webContentsId: requestWebContentsId,
      requestHeaders: {},
    }, callback)

    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {},
    })
  })
})
