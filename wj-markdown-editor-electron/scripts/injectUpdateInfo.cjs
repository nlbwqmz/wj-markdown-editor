const fs = require('node:fs')

// 解析 ELF64 的 section 表，返回 { name, offset, size } 列表。
// 偏移从文件头动态读取，避免硬编码（不同 runtime 版本的 .upd_info 偏移不同）。
function parseElfSections(buffer) {
  if (buffer[4] !== 2) {
    throw new Error('仅支持 ELF64 文件')
  }

  const sectionHeaderOffset = Number(buffer.readBigUInt64LE(0x28))
  const sectionHeaderEntrySize = buffer.readUInt16LE(0x3A)
  const sectionHeaderCount = buffer.readUInt16LE(0x3C)
  const shstrtabIndex = buffer.readUInt16LE(0x3E)

  const shstrtabHeaderOffset = sectionHeaderOffset + shstrtabIndex * sectionHeaderEntrySize
  const shstrtabOffset = Number(buffer.readBigUInt64LE(shstrtabHeaderOffset + 0x18))
  const shstrtabSize = Number(buffer.readBigUInt64LE(shstrtabHeaderOffset + 0x20))
  const shstrtab = buffer.subarray(shstrtabOffset, shstrtabOffset + shstrtabSize)

  const readSectionName = (nameOffset) => {
    let end = nameOffset
    while (end < shstrtab.length && shstrtab[end] !== 0) {
      end++
    }
    return shstrtab.subarray(nameOffset, end).toString('utf8')
  }

  const sections = []
  for (let index = 0; index < sectionHeaderCount; index++) {
    const headerOffset = sectionHeaderOffset + index * sectionHeaderEntrySize
    sections.push({
      name: readSectionName(buffer.readUInt32LE(headerOffset)),
      offset: Number(buffer.readBigUInt64LE(headerOffset + 0x18)),
      size: Number(buffer.readBigUInt64LE(headerOffset + 0x20)),
    })
  }

  return sections
}

// 把 update information 写入 ELF 的 .upd_info section。
// 写入前先清空整个 section，保证字符串结束后的预留空间保持为 0。
function injectUpdateInfo(filePath, updateInfo) {
  const buffer = fs.readFileSync(filePath)
  const section = parseElfSections(buffer).find(item => item.name === '.upd_info')

  if (!section) {
    throw new Error(`未找到 .upd_info section: ${filePath}`)
  }

  const updateInfoSize = Buffer.byteLength(updateInfo, 'utf8')
  if (updateInfoSize + 1 > section.size) {
    throw new Error(`update information 长度 ${updateInfoSize} 超过 .upd_info 预留 ${section.size} 字节`)
  }

  buffer.fill(0, section.offset, section.offset + section.size)
  buffer.write(updateInfo, section.offset, 'utf8')
  fs.writeFileSync(filePath, buffer)

  return { offset: section.offset, size: section.size, length: updateInfoSize }
}

module.exports = { injectUpdateInfo, parseElfSections }

// CLI 用法: node injectUpdateInfo.cjs <文件路径> <update information>
if (require.main === module) {
  const [filePath, updateInfo] = process.argv.slice(2)

  if (!filePath || !updateInfo) {
    console.error('用法: node injectUpdateInfo.cjs <文件路径> <update information>')
    process.exit(1)
  }

  try {
    const result = injectUpdateInfo(filePath, updateInfo)
    console.log(`已写入 .upd_info: offset=${result.offset} length=${result.length} capacity=${result.size}`)
  }
  catch (error) {
    console.error(`注入失败: ${error.message}`)
    process.exit(1)
  }
}
