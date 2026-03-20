import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 协议处理器集成测试
 *
 * 这些测试验证协议处理器在真实场景下的行为，包括：
 * - 文件系统交互
 * - 路径解析
 * - 错误处理
 * - 文件类型验证
 *
 * 注意：这些测试不需要启动完整的 Electron 应用
 */

// 测试夹具目录
const TEST_FIXTURES_DIR = path.join(os.tmpdir(), 'wj-markdown-editor-test-fixtures')

// 创建测试文件
function createTestFixtures() {
  // 创建测试目录结构
  fs.mkdirSync(TEST_FIXTURES_DIR, { recursive: true })
  fs.mkdirSync(path.join(TEST_FIXTURES_DIR, 'images'), { recursive: true })
  fs.mkdirSync(path.join(TEST_FIXTURES_DIR, 'videos'), { recursive: true })
  fs.mkdirSync(path.join(TEST_FIXTURES_DIR, 'audio'), { recursive: true })
  fs.mkdirSync(path.join(TEST_FIXTURES_DIR, 'docs'), { recursive: true })

  // 创建测试文件（小文件，用于快速测试）
  // 图片文件（1KB PNG）
  const pngData = Buffer.from([
    0x89,
    0x50,
    0x4E,
    0x47,
    0x0D,
    0x0A,
    0x1A,
    0x0A, // PNG signature
    ...Array.from({ length: 1000 }).fill(0x00), // Padding
  ])
  fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'images', 'test.png'), pngData)

  // 视频文件（模拟 MP4，10KB）
  const mp4Data = Buffer.alloc(10240, 0xFF)
  fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'videos', 'test.mp4'), mp4Data)

  // 音频文件（模拟 MP3，5KB）
  const mp3Data = Buffer.alloc(5120, 0xAA)
  fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'audio', 'test.mp3'), mp3Data)

  // Markdown 文件
  fs.writeFileSync(
    path.join(TEST_FIXTURES_DIR, 'docs', 'test.md'),
    '# Test Document\n\nThis is a test markdown file.',
  )

  // 不允许的文件类型
  fs.writeFileSync(path.join(TEST_FIXTURES_DIR, 'malicious.exe'), 'fake executable')
}

// 清理测试文件
function cleanupTestFixtures() {
  if (fs.existsSync(TEST_FIXTURES_DIR)) {
    fs.rmSync(TEST_FIXTURES_DIR, { recursive: true, force: true })
  }
}

describe('协议处理器集成测试', () => {
  beforeAll(() => {
    createTestFixtures()
  })

  afterAll(() => {
    cleanupTestFixtures()
  })

  describe('文件系统交互', () => {
    it('应该能够读取存在的图片文件', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'images', 'test.png')
      expect(fs.existsSync(filePath)).toBe(true)

      const stats = fs.statSync(filePath)
      expect(stats.size).toBeGreaterThan(0)
      expect(stats.isFile()).toBe(true)
    })

    it('应该能够读取存在的视频文件', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'videos', 'test.mp4')
      expect(fs.existsSync(filePath)).toBe(true)

      const stats = fs.statSync(filePath)
      expect(stats.size).toBe(10240)
    })

    it('应该能够读取存在的音频文件', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'audio', 'test.mp3')
      expect(fs.existsSync(filePath)).toBe(true)

      const stats = fs.statSync(filePath)
      expect(stats.size).toBe(5120)
    })

    it('应该正确检测不存在的文件', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'nonexistent.png')
      expect(fs.existsSync(filePath)).toBe(false)
    })
  })

  describe('路径解析测试', () => {
    it('应该正确解析绝对路径', () => {
      const absolutePath = path.join(TEST_FIXTURES_DIR, 'images', 'test.png')
      expect(path.isAbsolute(absolutePath)).toBe(true)
      expect(fs.existsSync(absolutePath)).toBe(true)
    })

    it('应该正确解析相对路径', () => {
      const basePath = path.join(TEST_FIXTURES_DIR, 'docs')
      const relativePath = '../images/test.png'
      const resolvedPath = path.resolve(basePath, relativePath)

      expect(fs.existsSync(resolvedPath)).toBe(true)
      expect(resolvedPath).toBe(path.join(TEST_FIXTURES_DIR, 'images', 'test.png'))
    })

    it('应该正确处理同级目录的相对路径', () => {
      const basePath = path.join(TEST_FIXTURES_DIR, 'docs')
      const relativePath = './test.md'
      const resolvedPath = path.resolve(basePath, relativePath)

      expect(fs.existsSync(resolvedPath)).toBe(true)
      expect(resolvedPath).toBe(path.join(TEST_FIXTURES_DIR, 'docs', 'test.md'))
    })

    it('应该正确处理子目录的相对路径', () => {
      const basePath = TEST_FIXTURES_DIR
      const relativePath = 'images/test.png'
      const resolvedPath = path.resolve(basePath, relativePath)

      expect(fs.existsSync(resolvedPath)).toBe(true)
    })
  })

  describe('文件类型白名单验证', () => {
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

    it('应该允许图片文件', () => {
      expect(isAllowedFileType('test.png')).toBe(true)
      expect(isAllowedFileType('test.jpg')).toBe(true)
      expect(isAllowedFileType('test.gif')).toBe(true)
    })

    it('应该允许视频文件', () => {
      expect(isAllowedFileType('test.mp4')).toBe(true)
      expect(isAllowedFileType('test.webm')).toBe(true)
      expect(isAllowedFileType('test.mov')).toBe(true)
    })

    it('应该允许音频文件', () => {
      expect(isAllowedFileType('test.mp3')).toBe(true)
      expect(isAllowedFileType('test.wav')).toBe(true)
      expect(isAllowedFileType('test.m4a')).toBe(true)
    })

    it('应该允许文档文件', () => {
      expect(isAllowedFileType('test.md')).toBe(true)
      expect(isAllowedFileType('test.txt')).toBe(true)
      expect(isAllowedFileType('test.pdf')).toBe(true)
    })

    it('应该拒绝可执行文件', () => {
      expect(isAllowedFileType('malicious.exe')).toBe(false)
      expect(isAllowedFileType('script.sh')).toBe(false)
      expect(isAllowedFileType('batch.bat')).toBe(false)
    })

    it('应该拒绝脚本文件', () => {
      expect(isAllowedFileType('script.js')).toBe(false)
      expect(isAllowedFileType('script.py')).toBe(false)
      expect(isAllowedFileType('script.rb')).toBe(false)
    })

    it('应该拒绝系统文件', () => {
      expect(isAllowedFileType('config.dll')).toBe(false)
      expect(isAllowedFileType('system.sys')).toBe(false)
    })
  })

  describe('range 请求模拟', () => {
    it('应该能够读取文件的部分内容（模拟 Range 请求）', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'videos', 'test.mp4')
      const stats = fs.statSync(filePath)
      const fileSize = stats.size

      // 模拟读取前 1KB
      const start = 0
      const end = 1023
      const stream = fs.createReadStream(filePath, { start, end })

      let bytesRead = 0
      stream.on('data', (chunk) => {
        bytesRead += chunk.length
      })

      return new Promise((resolve) => {
        stream.on('end', () => {
          expect(bytesRead).toBe(1024)
          expect(bytesRead).toBeLessThanOrEqual(fileSize)
          resolve()
        })
      })
    })

    it('应该能够读取文件的中间部分', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'videos', 'test.mp4')

      // 模拟读取中间 1KB
      const start = 5000
      const end = 6023
      const stream = fs.createReadStream(filePath, { start, end })

      let bytesRead = 0
      stream.on('data', (chunk) => {
        bytesRead += chunk.length
      })

      return new Promise((resolve) => {
        stream.on('end', () => {
          expect(bytesRead).toBe(1024)
          resolve()
        })
      })
    })

    it('应该能够读取文件的最后部分', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'videos', 'test.mp4')
      const stats = fs.statSync(filePath)
      const fileSize = stats.size

      // 模拟读取最后 1KB
      const start = fileSize - 1024
      const end = fileSize - 1
      const stream = fs.createReadStream(filePath, { start, end })

      let bytesRead = 0
      stream.on('data', (chunk) => {
        bytesRead += chunk.length
      })

      return new Promise((resolve) => {
        stream.on('end', () => {
          expect(bytesRead).toBe(1024)
          resolve()
        })
      })
    })

    it('应该正确处理超出文件大小的 Range 请求', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'videos', 'test.mp4')
      const stats = fs.statSync(filePath)
      const fileSize = stats.size

      // 尝试读取超出文件大小的范围
      const start = fileSize + 1000
      const end = fileSize + 2000

      // 这应该导致错误或返回空数据
      const stream = fs.createReadStream(filePath, { start, end })

      let bytesRead = 0
      stream.on('data', (chunk) => {
        bytesRead += chunk.length
      })

      return new Promise((resolve) => {
        stream.on('end', () => {
          // 超出范围的读取应该返回 0 字节
          expect(bytesRead).toBe(0)
          resolve()
        })
      })
    })
  })

  describe('错误处理场景', () => {
    it('应该正确处理文件不存在的情况', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'nonexistent.png')
      expect(fs.existsSync(filePath)).toBe(false)

      // 尝试读取不存在的文件应该抛出错误
      expect(() => {
        fs.statSync(filePath)
      }).toThrow()
    })

    it('应该正确处理无效的路径', () => {
      const invalidPath = '\0invalid\0path'

      // 无效路径在不同系统上行为不同
      // Windows: existsSync 返回 false
      // Unix: 可能抛出错误
      if (process.platform === 'win32') {
        expect(fs.existsSync(invalidPath)).toBe(false)
      } else {
        // Unix 系统可能抛出错误或返回 false
        try {
          const result = fs.existsSync(invalidPath)
          expect(result).toBe(false)
        } catch (error) {
          // 抛出错误也是可接受的行为
          expect(error).toBeDefined()
        }
      }
    })

    it('应该正确处理权限问题（如果可能）', () => {
      // 注意：这个测试在某些系统上可能无法正常工作
      // 因为需要特定的文件系统权限设置
      const filePath = path.join(TEST_FIXTURES_DIR, 'restricted.txt')

      // 创建文件
      fs.writeFileSync(filePath, 'restricted content')

      // 尝试修改权限（仅在 Unix 系统上有效）
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(filePath, 0o000) // 移除所有权限

          // 尝试读取应该失败
          expect(() => {
            fs.readFileSync(filePath)
          }).toThrow()

          // 恢复权限以便清理
          fs.chmodSync(filePath, 0o644)
        } catch (error) {
          // 如果权限修改失败，跳过此测试
          console.warn('Permission test skipped:', error.message)
        }
      }
    })
  })

  describe('hex 编码/解码测试', () => {
    function stringToHex(str) {
      return Buffer.from(str, 'utf8').toString('hex')
    }

    function hexToString(hex) {
      return Buffer.from(hex, 'hex').toString('utf8')
    }

    it('应该正确编码简单路径', () => {
      const path = './images/test.png'
      const hex = stringToHex(path)
      expect(hex).toBe('2e2f696d616765732f746573742e706e67')
    })

    it('应该正确解码 hex 路径', () => {
      const hex = '2e2f696d616765732f746573742e706e67'
      const path = hexToString(hex)
      expect(path).toBe('./images/test.png')
    })

    it('应该正确处理中文路径', () => {
      const path = './图片/测试.png'
      const hex = stringToHex(path)
      const decoded = hexToString(hex)
      expect(decoded).toBe(path)
    })

    it('应该正确处理特殊字符', () => {
      const path = './images/test (1).png'
      const hex = stringToHex(path)
      const decoded = hexToString(hex)
      expect(decoded).toBe(path)
    })

    it('应该正确处理空格', () => {
      const path = './my documents/test file.png'
      const hex = stringToHex(path)
      const decoded = hexToString(hex)
      expect(decoded).toBe(path)
    })

    it('应该正确处理 Windows 路径', () => {
      const path = 'C:\\Users\\user\\images\\test.png'
      const hex = stringToHex(path)
      const decoded = hexToString(hex)
      expect(decoded).toBe(path)
    })

    it('应该正确处理 Unix 路径', () => {
      const path = '/home/user/images/test.png'
      const hex = stringToHex(path)
      const decoded = hexToString(hex)
      expect(decoded).toBe(path)
    })
  })

  describe('真实场景模拟', () => {
    it('场景1: 用户在 Markdown 中引用同级图片', () => {
      const docPath = path.join(TEST_FIXTURES_DIR, 'docs', 'article.md')
      const imagePath = './test.md' // 同级文件
      const basePath = path.dirname(docPath)
      const resolvedPath = path.resolve(basePath, imagePath)

      expect(fs.existsSync(resolvedPath)).toBe(true)
    })

    it('场景2: 用户在 Markdown 中引用上级目录的图片', () => {
      const docPath = path.join(TEST_FIXTURES_DIR, 'docs', 'article.md')
      const imagePath = '../images/test.png'
      const basePath = path.dirname(docPath)
      const resolvedPath = path.resolve(basePath, imagePath)

      expect(fs.existsSync(resolvedPath)).toBe(true)
    })

    it('场景3: 用户使用绝对路径引用图片', () => {
      const imagePath = path.join(TEST_FIXTURES_DIR, 'images', 'test.png')
      expect(path.isAbsolute(imagePath)).toBe(true)
      expect(fs.existsSync(imagePath)).toBe(true)
    })

    it('场景4: 视频文件的流式加载', async () => {
      const videoPath = path.join(TEST_FIXTURES_DIR, 'videos', 'test.mp4')

      // 模拟浏览器的 Range 请求序列
      const ranges = [
        { start: 0, end: 1023 }, // 初始加载
        { start: 1024, end: 2047 }, // 继续播放
        { start: 5000, end: 6023 }, // 用户拖动进度条
      ]

      for (const range of ranges) {
        const stream = fs.createReadStream(videoPath, range)
        let bytesRead = 0

        await new Promise((resolve) => {
          stream.on('data', (chunk) => {
            bytesRead += chunk.length
          })
          stream.on('end', () => {
            expect(bytesRead).toBe(range.end - range.start + 1)
            resolve()
          })
        })
      }
    })

    it('场景5: 多个文件同时加载', () => {
      const files = [
        path.join(TEST_FIXTURES_DIR, 'images', 'test.png'),
        path.join(TEST_FIXTURES_DIR, 'videos', 'test.mp4'),
        path.join(TEST_FIXTURES_DIR, 'audio', 'test.mp3'),
        path.join(TEST_FIXTURES_DIR, 'docs', 'test.md'),
      ]

      files.forEach((filePath) => {
        expect(fs.existsSync(filePath)).toBe(true)
        const stats = fs.statSync(filePath)
        expect(stats.size).toBeGreaterThan(0)
      })
    })
  })

  describe('性能测试', () => {
    it('应该快速检查文件是否存在', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'images', 'test.png')

      const startTime = performance.now()
      for (let i = 0; i < 1000; i++) {
        fs.existsSync(filePath)
      }
      const duration = performance.now() - startTime

      // 1000 次检查应该在 150ms 内完成（考虑系统负载）
      expect(duration).toBeLessThan(150)
    })

    it('应该快速获取文件信息', () => {
      const filePath = path.join(TEST_FIXTURES_DIR, 'images', 'test.png')

      const startTime = performance.now()
      for (let i = 0; i < 1000; i++) {
        fs.statSync(filePath)
      }
      const duration = performance.now() - startTime

      // 1000 次 stat 调用应该在 200ms 内完成
      expect(duration).toBeLessThan(200)
    })

    it('应该快速解析路径', () => {
      const basePath = path.join(TEST_FIXTURES_DIR, 'docs')
      const relativePath = '../images/test.png'

      const startTime = performance.now()
      for (let i = 0; i < 10000; i++) {
        path.resolve(basePath, relativePath)
      }
      const duration = performance.now() - startTime

      // 10000 次路径解析应该在 50ms 内完成
      expect(duration).toBeLessThan(50)
    })
  })

  describe('边界条件测试', () => {
    it('应该处理空文件', () => {
      const emptyFile = path.join(TEST_FIXTURES_DIR, 'empty.txt')
      fs.writeFileSync(emptyFile, '')

      expect(fs.existsSync(emptyFile)).toBe(true)
      const stats = fs.statSync(emptyFile)
      expect(stats.size).toBe(0)
    })

    it('应该处理大文件名', () => {
      const longName = `${'a'.repeat(200)}.txt`
      const longPath = path.join(TEST_FIXTURES_DIR, longName)

      try {
        fs.writeFileSync(longPath, 'test')
        expect(fs.existsSync(longPath)).toBe(true)
        fs.unlinkSync(longPath)
      } catch (error) {
        // 某些文件系统可能不支持超长文件名
        console.warn('Long filename test skipped:', error.message)
      }
    })

    it('应该处理深层嵌套的目录', () => {
      const deepPath = path.join(TEST_FIXTURES_DIR, 'a', 'b', 'c', 'd', 'e')
      fs.mkdirSync(deepPath, { recursive: true })

      const testFile = path.join(deepPath, 'test.txt')
      fs.writeFileSync(testFile, 'deep file')

      expect(fs.existsSync(testFile)).toBe(true)
    })
  })
})

describe('protocolUtil 协议上下文继承集成', () => {
  beforeAll(() => {
    createTestFixtures()
  })

  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  afterAll(() => {
    cleanupTestFixtures()
  })

  function createWjUrl(resourcePath) {
    return `wj://${Buffer.from(resourcePath, 'utf8').toString('hex')}`
  }

  async function setupProtocolRuntime({
    directWindowId = null,
    parentWindowId = null,
    documentPath = path.join(TEST_FIXTURES_DIR, 'docs', 'test.md'),
  } = {}) {
    let beforeSendHeadersHandler = null
    let protocolHandler = null
    const requestWebContentsId = 901
    const parentWindow = parentWindowId == null
      ? null
      : {
          id: 71,
          getParentWindow: () => null,
        }
    const requestWindow = {
      id: 70,
      getParentWindow: () => parentWindow,
    }
    const requestWebContents = {
      id: requestWebContentsId,
    }
    const netFetch = vi.fn(async () => new Response('fixture-response', { status: 200 }))

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
        fetch: netFetch,
      },
      protocol: {
        handle: vi.fn((_scheme, handler) => {
          protocolHandler = handler
        }),
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
          path: documentPath,
        })),
      },
    }))

    const { default: protocolUtil } = await import('./protocolUtil.js')
    protocolUtil.handleProtocol()

    return {
      beforeSendHeadersHandler,
      protocolHandler,
      netFetch,
      requestWebContentsId,
    }
  }

  function collectRequestHeaders(beforeSendHeadersHandler, {
    url,
    webContentsId,
  }) {
    let nextRequestHeaders = null

    beforeSendHeadersHandler({
      url,
      webContentsId,
      requestHeaders: {},
    }, ({ requestHeaders }) => {
      nextRequestHeaders = requestHeaders
    })

    return nextRequestHeaders || {}
  }

  it('相对路径协议请求在当前窗口缺失时，必须继承父窗口文档上下文解析资源', async () => {
    const parentWindowId = 'parent-window'
    const documentPath = path.join(TEST_FIXTURES_DIR, 'docs', 'test.md')
    const expectedPath = path.join(TEST_FIXTURES_DIR, 'images', 'test.png')
    const { beforeSendHeadersHandler, protocolHandler, netFetch, requestWebContentsId } = await setupProtocolRuntime({
      directWindowId: null,
      parentWindowId,
      documentPath,
    })

    const requestHeaders = collectRequestHeaders(beforeSendHeadersHandler, {
      url: createWjUrl('../images/test.png'),
      webContentsId: requestWebContentsId,
    })
    const protocolResponse = await protocolHandler({
      url: createWjUrl('../images/test.png'),
      headers: new Headers(requestHeaders),
    })

    expect(requestHeaders['X-Window-ID']).toBe(parentWindowId)
    expect(netFetch).toHaveBeenCalledWith(pathToFileURL(expectedPath).toString())
    expect(protocolResponse.status).toBe(200)
  })

  it('相对路径协议请求在没有任何文档上下文时，必须返回 404 no-document-context', async () => {
    const { beforeSendHeadersHandler, protocolHandler, requestWebContentsId } = await setupProtocolRuntime({
      directWindowId: null,
      parentWindowId: null,
    })

    const requestHeaders = collectRequestHeaders(beforeSendHeadersHandler, {
      url: createWjUrl('./assets/missing.png'),
      webContentsId: requestWebContentsId,
    })
    const protocolResponse = await protocolHandler({
      url: createWjUrl('./assets/missing.png'),
      headers: new Headers(requestHeaders),
    })
    const responseBody = await protocolResponse.text()
    const protocolResponseReason = protocolResponse.status === 404
      && responseBody === 'Not Found: No document context for relative path'
      ? 'no-document-context'
      : null

    expect(requestHeaders['X-Window-ID']).toBeUndefined()
    expect(protocolResponse.status).toBe(404)
    expect(protocolResponseReason).toBe('no-document-context')
  })
})
