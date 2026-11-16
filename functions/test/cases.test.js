import test from 'node:test'
import assert from 'node:assert/strict'
import { cases } from '../../src/cases.js'
import { caseKeys, caseRubrics } from '../caseKeys.js'

test('all ten fictional cases have aligned private answer keys and scoring rubrics', () => {
  assert.equal(cases.length, 10)
  assert.deepEqual(new Set(cases.map((gameCase) => gameCase.difficulty)), new Set(['Easy', 'Medium', 'Hard']))

  for (const gameCase of cases) {
    const key = caseKeys[gameCase.id]
    const rubric = caseRubrics[gameCase.id]
    assert.ok(key, `${gameCase.id} has a private answer key`)
    assert.ok(rubric, `${gameCase.id} has a server scoring rubric`)
    assert.ok(gameCase.evidence.length >= 5 && gameCase.evidence.length <= 10)
    assert.ok(gameCase.suspects.length >= 3 && gameCase.suspects.length <= 5)
    assert.equal(gameCase.difficulty, key.difficulty)
    assert.equal(gameCase.duration, rubric.durationMinutes)
    assert.deepEqual(gameCase.questions.map((question) => question.id).sort(), Object.keys(key.answers).sort())
    assert.deepEqual(gameCase.timeline, key.timeline)

    for (const question of gameCase.questions) {
      assert.ok(Number.isInteger(key.answers[question.id]))
      assert.ok(key.answers[question.id] >= 0 && key.answers[question.id] < question.options.length, `${gameCase.id}/${question.id} answer index is valid`)
    }

    for (const evidenceIndex of rubric.evidence) {
      assert.ok(evidenceIndex >= 0 && evidenceIndex < gameCase.evidence.length, `${gameCase.id} evidence index is valid`)
    }
  }
})

test('public case briefs contain no answer-key fields', () => {
  for (const gameCase of cases) {
    for (const question of gameCase.questions) {
      assert.equal(Object.hasOwn(question, 'answer'), false)
      assert.equal(Object.hasOwn(question, 'correctAnswer'), false)
    }
  }
})