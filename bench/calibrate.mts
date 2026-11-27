/**
 * Is the driver fit to measure these servers? Two questions:
 *
 * - How fast can it go? It drives a sink, a single thread that answers without
 *   parsing. Servers must stay well below that.
 * - Does it change what it measures? The same servers are driven with other
 *   numbers of threads, and by other tools. The server is saturated in all of
 *   these; what differs is how much of its time goes into waking the client.
 */
import { execFile, spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'

import { contender } from './contenders.mts'
import { environment, keepAwake, output, quiet } from './environment.mts'
import { drive, LOADGEN, measure, planOf, usage } from './load.mts'
import { scenario } from './scenarios.mts'
import { ROOT, start } from './server.mts'
import { median } from './stats.mts'

import type { LoadOptions } from './load.mts'
import type { Server } from './server.mts'

const run = promisify(execFile)

const CONNECTIONS = 64
const SECONDS = 3
const base: LoadOptions = {
  connections: CONNECTIONS,
  threads: 2,
  warmupMs: 300,
  durationMs: SECONDS * 1000,
  seed: 1,
  headers: 'minimal',
}

interface Tool {
  name: string
  available: boolean
  rps(server: Server): Promise<number>
}

const own = (name: string, options: Partial<LoadOptions>): Tool => ({
  name,
  available: true,
  rps: async (server) =>
    (await measure(server, [scenario('ping')], { ...base, warmupMs: 0, ...options })).rps,
})

const url = (server: Server) => `http://${server.addr}/ping`
const has = (command: string) => output('which', [command]) !== null

const AUTOCANNON = join(ROOT, 'node_modules', 'autocannon', 'autocannon.js')
const autocannon = (name: string, args: string[]): Tool => ({
  name,
  available: true,
  rps: async (server) => {
    const { stdout } = await run(
      process.execPath,
      [AUTOCANNON, '-c', String(CONNECTIONS), '-d', String(SECONDS), '-j', ...args, url(server)],
      { maxBuffer: 1e8 },
    )
    return (JSON.parse(stdout) as { requests: { average: number } }).requests.average
  },
})

const TOOLS: Tool[] = [
  own('loadgen, 1 thread', { threads: 1 }),
  own('loadgen, 2 threads (used here)', { threads: 2 }),
  own('loadgen, 3 threads', { threads: 3 }),
  own('loadgen, 2 sleeping threads', { threads: 2, block: true }),
  {
    name: 'wrk, 2 threads',
    available: has('wrk'),
    rps: async (server) => {
      const { stdout } = await run('wrk', ['-t2', `-c${CONNECTIONS}`, `-d${SECONDS}s`, url(server)])
      return Number(/Requests\/sec:\s+([\d.]+)/.exec(stdout)![1])
    },
  },
  {
    name: 'oha',
    available: has('oha'),
    rps: async (server) => {
      const { stdout } = await run('oha', [
        '-c',
        String(CONNECTIONS),
        '-z',
        `${SECONDS}s`,
        '--no-tui',
        '--output-format',
        'json',
        url(server),
      ])
      return (JSON.parse(stdout) as { summary: { requestsPerSec: number } }).summary.requestsPerSec
    },
  },
  {
    name: 'bombardier (used for 1.x)',
    available: has('bombardier'),
    rps: async (server) => {
      const { stdout } = await run('bombardier', [
        '-c',
        String(CONNECTIONS),
        '-d',
        `${SECONDS}s`,
        '--print',
        'r',
        '--format',
        'json',
        url(server),
      ])
      return (JSON.parse(stdout) as { result: { rps: { mean: number } } }).result.rps.mean
    },
  },
  autocannon('autocannon (used for 1.x)', []),
  autocannon('autocannon, 4 workers', ['-w', '4']),
]

export interface Calibration {
  at: string
  environment: ReturnType<typeof environment>
  sink: { threads: number; rps: number; busyShare: number }[]
  tools: { tool: string; server: string; rps: number; mainShare: number }[]
}

async function withSink<T>(work: (addr: string) => Promise<T>): Promise<T> {
  const addr = '127.0.0.1:4999'
  const sink = spawn(LOADGEN, ['sink', addr, '15'], { stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    await new Promise<void>((resolve) =>
      createInterface({ input: sink.stdout }).once('line', () => resolve()),
    )
    return await work(addr)
  } finally {
    sink.kill('SIGKILL')
  }
}

export async function calibrate(file: string): Promise<Calibration> {
  keepAwake()
  const result: Calibration = {
    at: new Date().toISOString(),
    environment: environment(),
    sink: [],
    tools: [],
  }
  await quiet(2, 20_000)

  console.log('The driver against a single-threaded server that does nothing:')
  await withSink(async (addr) => {
    for (const threads of [1, 2, 3, 4]) {
      const runs = []
      for (let i = 0; i < 3; i++) {
        runs.push(await drive(planOf(addr, [scenario('ping')], { ...base, threads })))
      }
      const row = {
        threads,
        rps: median(runs.map((r) => r.rps)),
        busyShare: median(runs.map((r) => r.busyShare)),
      }
      result.sink.push(row)
      console.log(
        `  ${threads} threads  ${Math.round(row.rps)} rps, driver ${Math.round(row.busyShare * 100)} % busy`,
      )
    }
  })

  const tools = TOOLS.filter((tool) => tool.available)
  const missing = TOOLS.filter((tool) => !tool.available)
  if (missing.length > 0) {
    console.log(`Not installed, left out: ${missing.map((tool) => tool.name).join('; ')}`)
  }
  for (const id of ['bun-serve', 'navios-bun', 'node-http', 'navios-fastify']) {
    console.log(`${id}:`)
    const server = await start(contender(id), 'full')
    await server.gc()
    await measure(server, [scenario('ping')], base)
    const runs = new Map(tools.map((tool) => [tool.name, [] as { rps: number; main: number }[]]))
    for (let round = 0; round < 3; round++) {
      for (const tool of tools) {
        const before = await server.stats()
        const rps = await tool.rps(server)
        const after = await server.stats()
        // Tools spend some of their time starting up, so the share of the main
        // thread is taken from their own run time.
        const share = usage(before, after).main * ((after.at - before.at) / (SECONDS * 1000))
        runs.get(tool.name)!.push({ rps, main: Math.min(share, 1) })
        await sleep(200)
      }
    }
    await server.stop()
    for (const [tool, rows] of runs) {
      const row = {
        tool,
        server: id,
        rps: median(rows.map((r) => r.rps)),
        mainShare: median(rows.map((r) => r.main)),
      }
      result.tools.push(row)
      console.log(
        `  ${tool.padEnd(34)} ${String(Math.round(row.rps)).padStart(7)} rps  server ${Math.round(row.mainShare * 100)} % busy`,
      )
    }
  }
  writeFileSync(file, JSON.stringify(result, null, 2))
  return result
}
