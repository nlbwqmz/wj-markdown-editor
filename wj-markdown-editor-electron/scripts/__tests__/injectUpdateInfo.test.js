import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { injectUpdateInfo, parseElfSections } from '../injectUpdateInfo.cjs'

const tempFileList = []

function createTempFile(buffer) {
  const filePath = path.join(
    os.tmpdir(),
    `inject-update-info-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`,
  )
  fs.writeFileSync(filePath, buffer)
  tempFileList.push(filePath)
  return filePath
}

// 构造最小 ELF64：
// [0, 64)              ELF header
// [64, 64 + 64 * n)    section header 表（null / .shstrtab / .upd_info）
// [.., ..)             shstrtab 内容
// [.., ..)             .upd_info 数据区（全 0）
function createMinimalElf({ updInfoSize = 64, includeUpdInfo = true } = {}) {
  const sectionHeaderEntrySize = 64
  const sectionHeaderTableOffset = 64
  const sectionHeaderCount = includeUpdInfo ? 3 : 2
  const shstrtabOffset = sectionHeaderTableOffset + sectionHeaderCount * sectionHeaderEntrySize
  const shstrtab = Buffer.from('\0.shstrtab\0.upd_info\0', 'utf8')
  const updInfoOffset = shstrtabOffset + shstrtab.length

  const buffer = Buffer.alloc(updInfoOffset + updInfoSize)
  buffer.write('\x7FELF', 0, 'latin1')
  buffer[4] = 2 // ELF64
  buffer.writeBigUInt64LE(BigInt(sectionHeaderTableOffset), 0x28)
  buffer.writeUInt16LE(sectionHeaderEntrySize, 0x3A)
  buffer.writeUInt16LE(sectionHeaderCount, 0x3C)
  buffer.writeUInt16LE(1, 0x3E) // shstrndx

  const shstrtabHeaderOffset = sectionHeaderTableOffset + sectionHeaderEntrySize
  buffer.writeUInt32LE(1, shstrtabHeaderOffset)
  buffer.writeBigUInt64LE(BigInt(shstrtabOffset), shstrtabHeaderOffset + 0x18)
  buffer.writeBigUInt64LE(BigInt(shstrtab.length), shstrtabHeaderOffset + 0x20)

  if (includeUpdInfo) {
    const updInfoHeaderOffset = sectionHeaderTableOffset + 2 * sectionHeaderEntrySize
    buffer.writeUInt32LE(11, updInfoHeaderOffset)
    buffer.writeBigUInt64LE(BigInt(updInfoOffset), updInfoHeaderOffset + 0x18)
    buffer.writeBigUInt64LE(BigInt(updInfoSize), updInfoHeaderOffset + 0x20)
  }

  shstrtab.copy(buffer, shstrtabOffset)

  return { buffer, updInfoOffset, updInfoSize }
}

function readUpdInfoText(filePath, offset, size) {
  const section = fs.readFileSync(filePath).subarray(offset, offset + size)
  return {
    text: section.toString('utf8').replace(/\0+$/, ''),
    paddingIsZero: section.subarray(!section.includes(0) ? size : section.indexOf(0)).every(byte => byte === 0),
  }
}

afterEach(() => {
  while (tempFileList.length > 0) {
    fs.rmSync(tempFileList.pop(), { force: true })
  }
})

describe('injectUpdateInfo', () => {
  it('必须把 update information 写入 .upd_info，且预留空间保持为 0', () => {
    const { buffer, updInfoOffset, updInfoSize } = createMinimalElf({ updInfoSize: 256 })
    const filePath = createTempFile(buffer)
    const updateInfo = 'gh-releases-zsync|nlbwqmz|wj-markdown-editor|latest|wj-markdown-editor-*.AppImage.zsync'

    const result = injectUpdateInfo(filePath, updateInfo)

    expect(result.offset).toBe(updInfoOffset)
    expect(result.size).toBe(updInfoSize)

    const { text, paddingIsZero } = readUpdInfoText(filePath, updInfoOffset, updInfoSize)
    expect(text).toBe(updateInfo)
    expect(paddingIsZero).toBe(true)
  })

  it('重复注入必须覆盖旧值而不是叠加', () => {
    const { buffer, updInfoOffset, updInfoSize } = createMinimalElf({ updInfoSize: 256 })
    const filePath = createTempFile(buffer)

    injectUpdateInfo(filePath, 'gh-releases-zsync|a|b|latest|old.AppImage.zsync')
    injectUpdateInfo(filePath, 'gh-releases-zsync|nlbwqmz|wj-markdown-editor|latest|new.AppImage.zsync')

    const { text } = readUpdInfoText(filePath, updInfoOffset, updInfoSize)
    expect(text).toBe('gh-releases-zsync|nlbwqmz|wj-markdown-editor|latest|new.AppImage.zsync')
  })

  it('update information 超过 section 预留时必须报错', () => {
    const { buffer } = createMinimalElf({ updInfoSize: 8 })
    const filePath = createTempFile(buffer)

    expect(() => injectUpdateInfo(
      filePath,
      'gh-releases-zsync|nlbwqmz|wj-markdown-editor|latest|wj-markdown-editor-*.AppImage.zsync',
    )).toThrow(/超过/)
  })

  it('缺少 .upd_info section 时必须报错', () => {
    const { buffer } = createMinimalElf({ includeUpdInfo: false })
    const filePath = createTempFile(buffer)

    expect(() => injectUpdateInfo(
      filePath,
      'gh-releases-zsync|a|b|latest|c.AppImage.zsync',
    )).toThrow(/未找到/)
  })

  it('parseElfSections 必须解析出 section 名称与偏移', () => {
    const { buffer, updInfoOffset, updInfoSize } = createMinimalElf({ updInfoSize: 32 })

    const sections = parseElfSections(buffer)
    const updInfoSection = sections.find(item => item.name === '.upd_info')

    expect(updInfoSection).toBeDefined()
    expect(updInfoSection.offset).toBe(updInfoOffset)
    expect(updInfoSection.size).toBe(updInfoSize)
  })

  it('非 ELF64 文件必须报错', () => {
    expect(() => parseElfSections(Buffer.from('not an elf file'))).toThrow(/ELF64/)
  })
})
