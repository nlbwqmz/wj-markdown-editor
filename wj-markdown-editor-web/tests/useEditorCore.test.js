import test from 'node:test'
import assert from 'node:assert/strict'
import { isPointerSelectionUpdate } from '../src/components/editor/composables/selectionUpdateUtil.js'

function createMockUpdate(eventNames) {
  return {
    transactions: eventNames.map(eventName => ({
      isUserEvent: (pattern) => {
        if (!pattern) {
          return false
        }
        if (eventName === pattern) {
          return true
        }
        return eventName.startsWith(`${pattern}.`)
      },
    })),
  }
}

test('isPointerSelectionUpdate 应识别鼠标选区事务', () => {
  assert.equal(isPointerSelectionUpdate(createMockUpdate(['select.pointer'])), true)
  assert.equal(isPointerSelectionUpdate(createMockUpdate(['select.keyboard'])), false)
  assert.equal(isPointerSelectionUpdate(createMockUpdate([''])), false)
})
