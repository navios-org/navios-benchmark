/** The suites. Each writes rows; nothing is averaged before the report. */
import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'

import { supported } from './conformance.mts'
import { environment, keepAwake, quiet } from './environment.mts'
import { measure, MIX } from './load.mts'
import { packagedLaunch, PACKAGINGS } from './package.mts'
import { scenario, scenarios } from './scenarios.mts'
import { start } from './server.mts'
import { random, shuffle } from './stats.mts'

import type { Contender, Mode } from './contenders.mts'
import type { HeaderProfile, LoadOptions, Measurement } from './load.mts'
import type { Packaging } from './package.mts'
import type { Scenario } from './scenarios.mts'
import type { Server } from './server.mts'

export type Suite = 'throughput' | 'latency' | 'connections' | 'startup' | 'memory'
export const SUITES: Suite[] = ['throughput', 'latency', 'connections', 'startup', 'memory']

export interface Options {
  suites: Suite[]
  contenders: Contender[]
  scenarios: Scenario[]
  modes: Mode[]
  rounds: number
  durationMs: number
  warmupMs: number
  connections: number
  threads: number
  pipeline: number
  headers: HeaderProfile
  rates: number[]
  connectionCounts: number[]
  startups: number
  memoryRate: number
  memoryMs: number
  /** Contenders that also run under a second name, to see the noise. */
  clones: string[]
  seed: number
}

type Row = Pick<
  Measurement,
  | 'rps'
  | 'requests'
  | 'cpuUs'
  | 'mainShare'
  | 'processShare'
  | 'busyShare'
  | 'latencyUs'
  | 'unexpected'
  | 'errors'
  | 'late'
  | 'flags'
> & { contender: string; mode: Mode; round: number; at: number; background: number }

export type ThroughputRow = Row & { scenario: string; connections: number }
export type LatencyRow = Row & { rate: number }
export interface StartupRow {
  contender: string
  packaging: Packaging
  round: number
  ms: number
}
export interface MemoryRow {
  contender: string
  mode: Mode
  round: number
  idleMiB: number
  peakMiB: number
  settledMiB: number
  flags: string[]
}

export interface Results {
  version: 2
  startedAt: string
  finishedAt: string | null
  environment: ReturnType<typeof environment>
  options: Omit<Options, 'contenders' | 'scenarios'> & { contenders: string[]; scenarios: string[] }
  throughput: ThroughputRow[]
  connections: ThroughputRow[]
  latency: LatencyRow[]
  startup: StartupRow[]
  memory: MemoryRow[]
  failures: string[]
}

/** What a desktop does anyway, in busy cores. Above it, the run waits a while. */
const QUIET_CORES = 2
const PATIENCE_MS = 20_000

const run = promisify(execFile)

async function rssMiB(pid: number): Promise<number> {
  const { stdout } = await run('ps', ['-o', 'rss=', '-p', String(pid)])
  return Number(stdout.trim()) / 1024
}

const round2 = (value: number) => Math.round(value * 100) / 100
const round4 = (value: number) => Math.round(value * 10_000) / 10_000

function row(
  measured: Measurement,
  rest: { contender: string; mode: Mode; round: number; background: number },
): Row {
  return {
    ...rest,
    at: Date.now(),
    rps: round2(measured.rps),
    requests: measured.requests,
    cpuUs: round4(measured.cpuUs),
    mainShare: round4(measured.mainShare),
    processShare: round4(measured.processShare),
    busyShare: round4(measured.busyShare),
    latencyUs: Object.fromEntries(
      Object.entries(measured.latencyUs).map(([key, value]) => [key, round2(value as number)]),
    ) as unknown as Measurement['latencyUs'],
    unexpected: measured.unexpected,
    errors: measured.errors,
    late: measured.late,
    flags: measured.flags,
  }
}

export async function runAll(options: Options, file: string): Promise<Results> {
  keepAwake()
  const results: Results = {
    version: 2,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    environment: environment(),
    options: {
      ...options,
      contenders: options.contenders.map((c) => c.id),
      scenarios: options.scenarios.map((s) => s.id),
    },
    throughput: [],
    connections: [],
    latency: [],
    startup: [],
    memory: [],
    failures: [],
  }
  mkdirSync(dirname(file), { recursive: true })
  const save = () => writeFileSync(file, JSON.stringify(results))
  const next = random(options.seed)

  const entries = options.contenders.flatMap((contender) =>
    options.modes
      .filter((mode) => contender.modes.includes(mode))
      .flatMap((mode) => [
        { contender, mode, name: contender.id },
        ...(options.clones.includes(contender.id)
          ? [{ contender, mode, name: `${contender.id}#2` }]
          : []),
      ]),
  )
  const load: LoadOptions = {
    connections: options.connections,
    threads: options.threads,
    pipeline: options.pipeline,
    warmupMs: 400,
    durationMs: options.durationMs,
    seed: options.seed,
    headers: options.headers,
  }

  /**
   * Every route is warm before the first is measured, as in a service that has
   * been up for a while, and the heap has been collected. On Node.js that also
   * removes a bias: a collection during start-up slows process.nextTick for
   * the life of the process, and only larger applications have one.
   */
  async function warm(server: Server, contender: Contender) {
    await server.gc()
    const all = scenarios.filter((s) => !s.idle && supported(contender, s))
    await measure(
      server,
      all.map((s) => ({ ...s, weight: s.id === 'large' ? 1 : 5 })),
      { ...load, pipeline: 1, warmupMs: 0, durationMs: options.warmupMs },
    )
    await server.gc()
  }

  /**
   * One server, from start to stop. A session that fails is kept as a failure,
   * its rows are dropped, and it runs once more with a new server.
   */
  async function withServer(
    entry: (typeof entries)[number],
    what: string,
    work: (server: Server, background: number) => Promise<void>,
  ) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const background = round2(await quiet(QUIET_CORES, PATIENCE_MS))
      const kept = {
        throughput: results.throughput.length,
        connections: results.connections.length,
        latency: results.latency.length,
      }
      let server: Server | undefined
      let failed = false
      const begin = performance.now()
      try {
        server = await start(entry.contender, entry.mode)
        await warm(server, entry.contender)
        await work(server, background)
      } catch (error) {
        failed = true
        results.throughput.length = kept.throughput
        results.connections.length = kept.connections
        results.latency.length = kept.latency
        results.failures.push(
          `${what} ${entry.name} ${entry.mode}, attempt ${attempt}: ${String(error).slice(0, 500)}`,
        )
        console.error(results.failures.at(-1))
      } finally {
        await server?.stop()
        save()
      }
      console.log(
        `${new Date().toISOString().slice(11, 19)} ${what.padEnd(16)} ${entry.name.padEnd(20)} ${entry.mode.padEnd(8)} ${((performance.now() - begin) / 1000).toFixed(0).padStart(4)} s  background ${background.toFixed(1)} cores${failed ? '  failed' : ''}`,
      )
      await sleep(200)
      if (!failed) {
        return
      }
    }
  }

  // ------------------------------------------------------------ throughput
  if (options.suites.includes('throughput')) {
    for (let round = 1; round <= options.rounds; round++) {
      for (const entry of shuffle(entries, next)) {
        await withServer(
          entry,
          `throughput ${round}/${options.rounds}`,
          async (server, background) => {
            for (const s of shuffle(options.scenarios, next)) {
              if (supported(entry.contender, s)) {
                const measured = await measure(server, [s], {
                  ...load,
                  connections: s.idle ? 256 : load.connections,
                })
                results.throughput.push({
                  ...row(measured, { contender: entry.name, mode: entry.mode, round, background }),
                  scenario: s.id,
                  connections: s.idle ? 256 : load.connections,
                })
              }
            }
            const measured = await measure(server, MIX, load)
            results.throughput.push({
              ...row(measured, { contender: entry.name, mode: entry.mode, round, background }),
              scenario: 'mix',
              connections: load.connections,
            })
          },
        )
      }
    }
  }

  const full = entries.filter(
    (e) => e.mode === (options.modes[0] ?? 'full') && !e.name.includes('#'),
  )

  // --------------------------------------------------------------- latency
  if (options.suites.includes('latency')) {
    for (let round = 1; round <= Math.min(options.rounds, 3); round++) {
      for (const entry of shuffle(full, next)) {
        await withServer(entry, `latency ${round}`, async (server, background) => {
          for (const rate of options.rates) {
            const measured = await measure(server, MIX, {
              ...load,
              pipeline: 1,
              rate,
              warmupMs: 500,
              durationMs: options.durationMs,
            })
            results.latency.push({
              ...row(measured, { contender: entry.name, mode: entry.mode, round, background }),
              rate,
            })
            // Beyond what it can do, every further rate says the same.
            if (measured.rps < rate * 0.97) {
              break
            }
          }
        })
      }
    }
  }

  // ----------------------------------------------------------- connections
  if (options.suites.includes('connections')) {
    for (let round = 1; round <= Math.min(options.rounds, 3); round++) {
      for (const entry of shuffle(full, next)) {
        await withServer(entry, `connections ${round}`, async (server, background) => {
          for (const connections of shuffle(options.connectionCounts, next)) {
            const measured = await measure(server, [scenario('param')], { ...load, connections })
            results.connections.push({
              ...row(measured, { contender: entry.name, mode: entry.mode, round, background }),
              scenario: 'param',
              connections,
            })
          }
        })
      }
    }
  }

  // --------------------------------------------------------------- startup
  if (options.suites.includes('startup')) {
    const launches = full.flatMap((entry) =>
      PACKAGINGS.flatMap((packaging) => {
        const launch = packagedLaunch(entry.contender, packaging)
        return launch ? [{ ...entry, packaging, launch }] : []
      }),
    )
    await quiet(QUIET_CORES, PATIENCE_MS)
    // The first start of each reads it from the disk and is not kept.
    for (let round = 0; round <= options.startups; round++) {
      for (const { contender, mode, name, packaging, launch } of shuffle(launches, next)) {
        try {
          const server = await start(contender, mode, launch)
          await server.stop()
          if (round > 0) {
            results.startup.push({
              contender: name,
              packaging,
              round,
              ms: round2(server.startupMs),
            })
          }
        } catch (error) {
          results.failures.push(`startup ${name} ${packaging}: ${String(error).slice(0, 500)}`)
        }
      }
      save()
      console.log(`startup ${round}/${options.startups}`)
    }
  }

  // ---------------------------------------------------------------- memory
  if (options.suites.includes('memory')) {
    for (let round = 1; round <= Math.min(options.rounds, 3); round++) {
      for (const entry of shuffle(full, next)) {
        const server = await start(entry.contender, entry.mode)
        try {
          await server.gc()
          await sleep(300)
          const idleMiB = await rssMiB(server.pid)
          let peakMiB = idleMiB
          const sampling = { on: true }
          const sampler = (async () => {
            while (sampling.on) {
              peakMiB = Math.max(peakMiB, await rssMiB(server.pid))
              await sleep(100)
            }
          })()
          // The same number of requests for everyone, so a fixed rate.
          const measured = await measure(server, MIX, {
            ...load,
            pipeline: 1,
            rate: options.memoryRate,
            warmupMs: 0,
            durationMs: options.memoryMs,
          })
          sampling.on = false
          await sampler
          await server.gc()
          await sleep(300)
          results.memory.push({
            contender: entry.name,
            mode: entry.mode,
            round,
            idleMiB: round2(idleMiB),
            peakMiB: round2(peakMiB),
            settledMiB: round2(await rssMiB(server.pid)),
            flags: measured.flags,
          })
        } catch (error) {
          results.failures.push(`memory ${entry.name}: ${String(error).slice(0, 500)}`)
        } finally {
          await server.stop()
          save()
        }
        console.log(`memory ${round} ${entry.name}`)
      }
    }
  }

  results.finishedAt = new Date().toISOString()
  save()
  return results
}
