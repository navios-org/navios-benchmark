export function quantile(values: number[], q: number): number {
  if (values.length === 0) {
    return Number.NaN
  }
  const sorted = values.toSorted((a, b) => a - b)
  const at = (sorted.length - 1) * q
  const low = Math.floor(at)
  const high = Math.ceil(at)
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (at - low)
}

export function median(values: number[]): number {
  return quantile(values, 0.5)
}

export interface Summary {
  median: number
  min: number
  max: number
  /** Half of the range, relative to the median. */
  spread: number
  n: number
}

export function summarize(values: number[]): Summary {
  const mid = median(values)
  const min = Math.min(...values)
  const max = Math.max(...values)
  return { median: mid, min, max, spread: (max - min) / 2 / mid, n: values.length }
}

/** Whether every value of one is on the same side of every value of the other. */
export function disjoint(
  a: Pick<Summary, 'min' | 'max'>,
  b: Pick<Summary, 'min' | 'max'>,
): boolean {
  return a.min > b.max || b.min > a.max
}

/** The geometric mean: the right average of ratios. */
export function geomean(values: number[]): number {
  return Math.exp(values.reduce((sum, v) => sum + Math.log(v), 0) / values.length)
}

/** A small seeded generator, so that a run can be repeated in the same order. */
export function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(values: readonly T[], next: () => number): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}
