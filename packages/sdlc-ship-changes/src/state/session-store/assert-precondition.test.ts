import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertPrecondition } from './assert-precondition.js'
import type { SessionRecord } from './types.js'

function makeSession(completedSteps: SessionRecord['completedSteps']): SessionRecord {
  return {
    sessionId: 'test-session',
    timestamp: 0,
    currentStep: null,
    status: 'active',
    events: [],
    completedSteps,
  }
}

test('start_session has no predecessor to require', () => {
  const session = makeSession([])
  assert.deepEqual(assertPrecondition(session, 'start_session'), { ok: true })
})

test('passes when the immediate predecessor is completed', () => {
  const session = makeSession(['start_session', 'read_changes'])
  assert.deepEqual(assertPrecondition(session, 'quality_precheck'), { ok: true })
})

test('blocks when the immediate predecessor is missing, naming it', () => {
  const session = makeSession(['start_session'])
  const result = assertPrecondition(session, 'quality_precheck')
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.missingStep, 'read_changes')
    assert.match(result.message, /read_changes/)
    assert.match(result.message, /quality_precheck/)
  }
})
