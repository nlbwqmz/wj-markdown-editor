import assert from 'node:assert/strict'
import {
  getPreviewAssetDeleteReasonMessageKey,
  resolvePreviewAssetDeletePlan,
  shouldContinueMarkdownCleanup,
} from '../previewAssetDeleteDecisionUtil.js'

const { test } = await import('node:test')

test('普通文件单引用时，应允许删除引用并删除文件', () => {
  const result = resolvePreviewAssetDeletePlan({
    ok: true,
    exists: true,
    isDirectory: false,
    isFile: true,
  }, 1)

  assert.deepEqual(result, {
    mode: 'single',
    deleteFileEnabled: true,
    deleteAllReferencesEnabled: false,
    reason: 'resolved',
    reasonMessageKey: null,
    blockMessageKey: null,
  })
})

test('非法 payload 的本地资源仍应允许进入仅删引用模式', () => {
  const result = resolvePreviewAssetDeletePlan({
    ok: false,
    reason: 'invalid-resource-payload',
    exists: false,
    isDirectory: false,
    isFile: false,
  }, 3)

  assert.deepEqual(result, {
    mode: 'multi',
    deleteFileEnabled: false,
    deleteAllReferencesEnabled: true,
    reason: 'invalid-resource-payload',
    reasonMessageKey: 'message.invalidLocalResourceLink',
    blockMessageKey: null,
  })
})

test('未保存文档中的相对资源，应允许仅删除当前引用', () => {
  const result = resolvePreviewAssetDeletePlan({
    ok: false,
    reason: 'relative-resource-without-document',
    exists: false,
    isDirectory: false,
    isFile: false,
  }, 1)

  assert.deepEqual(result, {
    mode: 'single',
    deleteFileEnabled: false,
    deleteAllReferencesEnabled: false,
    reason: 'relative-resource-without-document',
    reasonMessageKey: 'message.relativeResourceRequiresSavedFile',
    blockMessageKey: null,
  })
})

test('远程资源删除时，应直接退化为仅删除 Markdown 引用模式', () => {
  const result = resolvePreviewAssetDeletePlan(null, 1, {
    sourceType: 'remote',
  })

  assert.deepEqual(result, {
    mode: 'single',
    deleteFileEnabled: false,
    deleteAllReferencesEnabled: false,
    reason: 'remote-resource',
    reasonMessageKey: 'previewAssetMenu.remoteResourceDeleteUnavailable',
    blockMessageKey: null,
  })
})

test('文件不存在时，应允许批量清理 Markdown 引用但不删文件', () => {
  const result = resolvePreviewAssetDeletePlan({
    ok: true,
    reason: 'resolved',
    exists: false,
    isDirectory: false,
    isFile: false,
  }, 2)

  assert.deepEqual(result, {
    mode: 'multi',
    deleteFileEnabled: false,
    deleteAllReferencesEnabled: true,
    reason: 'not-found',
    reasonMessageKey: 'message.theFileDoesNotExist',
    blockMessageKey: null,
  })
})

test('目录资源应直接阻断删除动作', () => {
  const result = resolvePreviewAssetDeletePlan({
    ok: true,
    reason: 'resolved',
    exists: true,
    isDirectory: true,
    isFile: false,
  }, 2)

  assert.deepEqual(result, {
    mode: 'blocked',
    deleteFileEnabled: false,
    deleteAllReferencesEnabled: false,
    reason: 'directory-not-allowed',
    reasonMessageKey: 'previewAssetMenu.deleteDirectoryNotAllowed',
    blockMessageKey: 'previewAssetMenu.deleteDirectoryNotAllowed',
  })
})

test('存在但不是普通文件的目标，应给出 unsupported-target 提示并进入仅删引用模式', () => {
  const result = resolvePreviewAssetDeletePlan({
    ok: true,
    reason: 'resolved',
    exists: true,
    isDirectory: false,
    isFile: false,
  }, 2)

  assert.deepEqual(result, {
    mode: 'multi',
    deleteFileEnabled: false,
    deleteAllReferencesEnabled: true,
    reason: 'unsupported-target',
    reasonMessageKey: 'previewAssetMenu.deleteUnsupportedTarget',
    blockMessageKey: null,
  })
})

test('应为删除失败原因返回统一提示文案 key', () => {
  assert.equal(getPreviewAssetDeleteReasonMessageKey('invalid-resource-url'), 'message.invalidLocalResourceLink')
  assert.equal(getPreviewAssetDeleteReasonMessageKey('invalid-resource-payload'), 'message.invalidLocalResourceLink')
  assert.equal(getPreviewAssetDeleteReasonMessageKey('relative-resource-without-document'), 'message.relativeResourceRequiresSavedFile')
  assert.equal(getPreviewAssetDeleteReasonMessageKey('remote-resource'), 'previewAssetMenu.remoteResourceDeleteUnavailable')
  assert.equal(getPreviewAssetDeleteReasonMessageKey('not-found'), 'message.theFileDoesNotExist')
  assert.equal(getPreviewAssetDeleteReasonMessageKey('unsupported-target'), 'previewAssetMenu.deleteUnsupportedTarget')
  assert.equal(getPreviewAssetDeleteReasonMessageKey('directory-not-allowed'), 'previewAssetMenu.deleteDirectoryNotAllowed')
  assert.equal(getPreviewAssetDeleteReasonMessageKey('deleted'), null)
})

test('文件删除失败时，应只对可恢复原因继续清理 Markdown', () => {
  assert.equal(shouldContinueMarkdownCleanup('invalid-resource-url'), true)
  assert.equal(shouldContinueMarkdownCleanup('invalid-resource-payload'), true)
  assert.equal(shouldContinueMarkdownCleanup('relative-resource-without-document'), true)
  assert.equal(shouldContinueMarkdownCleanup('not-found'), true)
  assert.equal(shouldContinueMarkdownCleanup('unsupported-target'), true)
  assert.equal(shouldContinueMarkdownCleanup('directory-not-allowed'), true)
  assert.equal(shouldContinueMarkdownCleanup('deleted'), false)
  assert.equal(shouldContinueMarkdownCleanup('unknown-reason'), false)
})
