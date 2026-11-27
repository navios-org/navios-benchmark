import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { merge } from './merge.mts'

import type { Results } from './run.mts'

const row = (contender: string, round: number, scenario: string) =>
  ({ contender, mode: 'full', round, scenario }) as unknown as Results['throughput'][number]

const results = (throughput: Results['throughput']) =>
  ({
    startedAt: 'now',
    environment: { versions: { a: '1', b: '1' } },
    throughput,
    connections: [],
    latency: [],
    startup: [],
    memory: [],
    failures: [],
  }) as unknown as Results

describe('merge', () => {
  it('replaces the session of the same contender, mode and round, and only that', () => {
    const into = results([row('a', 1, 'x'), row('a', 2, 'x'), row('b', 2, 'x')])
    const from = results([row('a', 1, 'x'), row('a', 1, 'y')])
    merge(into, from, 2)
    assert.deepEqual(
      into.throughput.map((r) => `${r.contender}${r.round}${r.scenario}`).toSorted(),
      ['a1x', 'a2x', 'a2y', 'b2x'],
    )
    assert.equal(into.throughput.filter((r) => r.contender === 'a' && r.round === 2).length, 2)
  })

  it('takes only the contenders it is told to, with their clones and versions', () => {
    const into = results([row('a', 1, 'x'), row('a#2', 1, 'x'), row('b', 1, 'x')])
    const from = results([row('a', 1, 'y'), row('a#2', 1, 'y'), row('b', 1, 'y')])
    from.environment.versions = { a: '2', b: '2' }
    merge(into, from, undefined, ['a'])
    assert.deepEqual(into.throughput.map((r) => `${r.contender}${r.scenario}`).toSorted(), [
      'a#2y',
      'ay',
      'bx',
    ])
    assert.deepEqual(into.environment.versions, { a: '2', b: '1' })
  })
})
