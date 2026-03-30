import assert from 'node:assert/strict'

import enUS from '../enUS.js'
import zhCN from '../zhCN.js'

const { test } = await import('node:test')

test('中英文文案都应提供缺失锚点提示', () => {
  assert.equal(
    zhCN.message.anchorTargetDoesNotExist,
    '锚点目标位置不存在',
  )
  assert.equal(
    enUS.message.anchorTargetDoesNotExist,
    'The anchor target does not exist.',
  )
})

test('中英文文案都应提供全屏相关文案', () => {
  assert.equal(
    zhCN.top.enterFullScreen,
    '进入全屏',
  )
  assert.equal(
    zhCN.top.exitFullScreen,
    '退出全屏',
  )
  assert.equal(
    zhCN.topMenu.view.children.enterFullScreen,
    '进入全屏',
  )
  assert.equal(
    zhCN.topMenu.view.children.exitFullScreen,
    '退出全屏',
  )
  assert.equal(
    zhCN.shortcutKey.toggleFullScreen,
    '全屏切换',
  )

  assert.equal(
    enUS.top.enterFullScreen,
    'Enter full screen',
  )
  assert.equal(
    enUS.top.exitFullScreen,
    'Exit full screen',
  )
  assert.equal(
    enUS.topMenu.view.children.enterFullScreen,
    'Enter Full Screen',
  )
  assert.equal(
    enUS.topMenu.view.children.exitFullScreen,
    'Exit Full Screen',
  )
  assert.equal(
    enUS.shortcutKey.toggleFullScreen,
    'Toggle full screen',
  )
})

test('中英文文案都应提供配置更新失败提示', () => {
  assert.equal(
    zhCN.message.configWriteFailed,
    '配置保存失败，请稍后重试。',
  )
  assert.equal(
    zhCN.message.configReadFailed,
    '读取配置失败，已回退到默认配置。',
  )
  assert.equal(
    zhCN.message.configDirectoryUnavailable,
    '配置目录不可用，请检查权限。',
  )
  assert.equal(
    zhCN.message.configInvalid,
    '配置内容无效，请检查当前修改。',
  )

  assert.equal(
    enUS.message.configWriteFailed,
    'Failed to save configuration. Please try again later.',
  )
  assert.equal(
    enUS.message.configReadFailed,
    'Failed to read configuration. The default configuration has been restored.',
  )
  assert.equal(
    enUS.message.configDirectoryUnavailable,
    'The configuration directory is unavailable. Please check permissions.',
  )
  assert.equal(
    enUS.message.configInvalid,
    'The configuration is invalid. Please review your changes.',
  )
})

test('中英文文案都应提供打开 Markdown 文件失败提示', () => {
  assert.equal(
    zhCN.message.openMarkdownFileFailed,
    '打开 Markdown 文件失败，请检查文件权限或占用状态。',
  )
  assert.equal(
    enUS.message.openMarkdownFileFailed,
    'Failed to open the Markdown file. Please check file permissions or whether it is in use.',
  )
})

test('中英文文案都应提供复制结果提示', () => {
  assert.equal(
    zhCN.message.noCopyableContent,
    '没有可复制的内容',
  )
  assert.equal(
    zhCN.message.copySucceeded,
    '复制成功',
  )
  assert.equal(
    zhCN.message.copyFailed,
    '复制失败',
  )
  assert.equal(
    zhCN.message.previewAssetCopyImageTargetUnavailable,
    '当前图片位置已变化，请重新右键后再试。',
  )
  assert.equal(
    zhCN.message.previewAssetInvalidCopyImageTarget,
    '当前复制目标无效，请重新打开菜单后再试。',
  )
  assert.equal(
    zhCN.message.previewAssetHostWindowUnavailable,
    '当前窗口已不可用，无法复制图片，请重试。',
  )
  assert.equal(zhCN.message.previewAssetCopyImageFormatUnsupported, undefined)

  assert.equal(
    enUS.message.noCopyableContent,
    'There is no content to copy.',
  )
  assert.equal(
    enUS.message.copySucceeded,
    'Copied successfully.',
  )
  assert.equal(
    enUS.message.copyFailed,
    'Copy failed.',
  )
  assert.equal(
    enUS.message.previewAssetCopyImageTargetUnavailable,
    'The image position has changed. Reopen the context menu and try again.',
  )
  assert.equal(
    enUS.message.previewAssetInvalidCopyImageTarget,
    'The copy target is invalid. Reopen the context menu and try again.',
  )
  assert.equal(
    enUS.message.previewAssetHostWindowUnavailable,
    'The current window is unavailable, so the image cannot be copied. Please try again.',
  )
  assert.equal(enUS.message.previewAssetCopyImageFormatUnsupported, undefined)
})

test('中英文文案都应提供另存为失败提示', () => {
  assert.equal(
    zhCN.message.saveAsFailed,
    '另存为失败',
  )
  assert.equal(
    enUS.message.saveAsFailed,
    'Save as failed.',
  )
})

test('中英文文案都应提供预览资源菜单新增标签', () => {
  assert.equal(
    zhCN.previewAssetMenu.copyAbsolutePath,
    '复制绝对路径',
  )
  assert.equal(
    zhCN.previewAssetMenu.copyImageLink,
    '复制图片链接',
  )
  assert.equal(
    zhCN.previewAssetMenu.copyResourceLink,
    '复制资源链接',
  )
  assert.equal(
    zhCN.previewAssetMenu.copyImage,
    '复制图片',
  )
  assert.equal(
    zhCN.previewAssetMenu.saveAs,
    '另存为',
  )
  assert.equal(
    zhCN.previewAssetMenu.copyMarkdownReference,
    '复制 Markdown 引用',
  )

  assert.equal(
    enUS.previewAssetMenu.copyAbsolutePath,
    'Copy absolute path',
  )
  assert.equal(
    enUS.previewAssetMenu.copyImageLink,
    'Copy image link',
  )
  assert.equal(
    enUS.previewAssetMenu.copyResourceLink,
    'Copy resource link',
  )
  assert.equal(
    enUS.previewAssetMenu.copyImage,
    'Copy image',
  )
  assert.equal(
    enUS.previewAssetMenu.saveAs,
    'Save as',
  )
  assert.equal(
    enUS.previewAssetMenu.copyMarkdownReference,
    'Copy Markdown reference',
  )
})
