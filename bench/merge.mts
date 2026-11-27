/**
 * Puts the sessions of one run into another, in place of the same contender,
 * mode and round. For a session that failed and was measured again; the run
 * keeps a note that says so.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

import type { Results } from './run.mts'

type Keyed = { contender: string; mode?: string; round: number; packaging?: string }
const SUITES = ['throughput', 'connections', 'latency', 'startup', 'memory'] as const

const key = (row: Keyed) => `${row.contender}|${row.mode ?? row.packaging}|${row.round}`

/**
 * `round` renumbers the rows of `from`, whose own rounds start at 1. `only`
 * takes the rows of those contenders and leaves the others of `from` out, as
 * for a run that measured unchanged servers beside the changed ones to see
 * that the two runs compare. The versions of what came in are those of `from`.
 */
export function merge(into: Results, from: Results, round?: number, only?: string[]): string[] {
  const notes: string[] = []
  const taken = new Set<string>()
  for (const suite of SUITES) {
    const incoming = (from[suite] as Keyed[])
      .filter((row) => !only || only.includes(row.contender.replace('#2', '')))
      .map((row) => (round ? { ...row, round } : row))
    for (const row of incoming) {
      taken.add(row.contender.replace('#2', ''))
    }
    if (incoming.length === 0) {
      continue
    }
    const replaced = new Set(incoming.map(key))
    const before = into[suite].length
    ;(into[suite] as Keyed[]) = (into[suite] as Keyed[]).filter((row) => !replaced.has(key(row)))
    ;(into[suite] as Keyed[]).push(...incoming)
    // A whole contender measured again is named once, not per session.
    const what =
      replaced.size > 6
        ? `${[...new Set(incoming.map((row) => row.contender))].toSorted().join(', ')} (${replaced.size} sessions)`
        : [...replaced].join(', ')
    notes.push(
      `${suite}: ${what} measured again at ${from.startedAt} (${before - into[suite].length + incoming.length} rows replaced by ${incoming.length})`,
    )
  }
  for (const id of taken) {
    const version = from.environment?.versions?.[id]
    if (version && into.environment.versions[id] !== version) {
      notes.push(`${id}: ${into.environment.versions[id]} replaced by ${version}`)
      into.environment.versions[id] = version
    }
  }
  return notes
}

export function mergeFiles(intoFile: string, fromFile: string, round?: number, only?: string[]) {
  const into = JSON.parse(readFileSync(intoFile, 'utf8')) as Results
  const from = JSON.parse(readFileSync(fromFile, 'utf8')) as Results
  const notes = merge(into, from, round, only)
  into.failures.push(...notes.map((note) => `${note}, from ${basename(fromFile)}`))
  writeFileSync(intoFile, JSON.stringify(into))
  for (const note of notes) {
    console.log(note)
  }
}
