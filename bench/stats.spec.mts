import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { difference } from './conformance.mts'
import { ANY } from './scenarios.mts'
import { disjoint, geomean, median, quantile, random, shuffle, summarize } from './stats.mts'

describe('statistics', () => {
  it('interpolates quantiles and does not change its input', () => {
    const values = [4, 1, 3, 2]
    assert.equal(median(values), 2.5)
    assert.equal(quantile(values, 0), 1)
    assert.equal(quantile(values, 1), 4)
    assert.deepEqual(values, [4, 1, 3, 2])
    assert.ok(Number.isNaN(median([])))
  })

  it('summarizes the spread as half of the range', () => {
    assert.deepEqual(summarize([90, 100, 110]), {
      median: 100,
      min: 90,
      max: 110,
      spread: 0.1,
      n: 3,
    })
  })

  it('calls overlapping results the same', () => {
    assert.equal(disjoint(summarize([1, 2, 3]), summarize([3, 4, 5])), false)
    assert.equal(disjoint(summarize([1, 2, 3]), summarize([4, 5])), true)
    assert.equal(disjoint(summarize([4, 5]), summarize([1, 2, 3])), true)
  })

  it('averages ratios so that their order does not matter', () => {
    assert.ok(Math.abs(geomean([2, 0.5]) - 1) < 1e-12)
  })

  it('shuffles reproducibly and loses nothing', () => {
    const values = Array.from({ length: 50 }, (_, i) => i)
    const once = shuffle(values, random(1))
    assert.deepEqual(once, shuffle(values, random(1)))
    assert.notDeepEqual(once, shuffle(values, random(2)))
    assert.deepEqual(
      once.toSorted((a, b) => a - b),
      values,
    )
  })
})

describe('difference', () => {
  it('finds what is missing, extra, or other', () => {
    assert.equal(difference({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), null)
    assert.match(difference({}, { a: 1 })!, /^\$\.a is undefined/)
    assert.match(difference({ a: 1, b: 2 }, { a: 1 })!, /^\$\.b should not/)
    assert.match(difference({ a: [1, 2, 3] }, { a: [1, 2] })!, /^\$\.a\.2 should not/)
    assert.match(difference([], {})!, /^\$ is/)
    assert.match(difference({ a: '1' }, { a: 1 })!, /^\$\.a is "1"/)
  })

  it('accepts anything but nothing where a value varies', () => {
    assert.equal(difference({ id: 'x' }, { id: ANY }), null)
    assert.match(difference({}, { id: ANY })!, /missing/)
  })
})
