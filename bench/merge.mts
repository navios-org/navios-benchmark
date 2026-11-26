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

/** `round` renumbers the rows of `from`, whose own rounds start at 1. */
export function merge(into: Results, from: Results, round?: number): string[] {
  const notes: string[] = []
  for (const suite of SUITES) {
    const incoming = (from[suite] as Keyed[]).map((row) => (round ? { ...row, round } : row))
    if (incoming.length === 0) {
      continue
    }
    const replaced = new Set(incoming.map(key))
    const before = into[suite].length
    ;(into[suite] as Keyed[]) = (into[suite] as Keyed[]).filter((row) => !replaced.has(key(row)))
    ;(into[suite] as Keyed[]).push(...incoming)
    notes.push(
      `${suite}: ${[...replaced].join(', ')} measured again at ${from.startedAt} (${before - into[suite].length + incoming.length} rows replaced by ${incoming.length})`,
    )
  }
  return notes
}

export function mergeFiles(intoFile: string, fromFile: string, round?: number) {
  const into = JSON.parse(readFileSync(intoFile, 'utf8')) as Results
  const from = JSON.parse(readFileSync(fromFile, 'utf8')) as Results
  const notes = merge(into, from, round)
  into.failures.push(...notes.map((note) => `${note}, from ${basename(fromFile)}`))
  writeFileSync(intoFile, JSON.stringify(into))
  for (const note of notes) {
    console.log(note)
  }
}
