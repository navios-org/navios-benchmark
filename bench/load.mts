/** Running the load driver against a server, and reading both ends of it. */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import { scenarios } from './scenarios.mts'
import { ROOT } from './server.mts'

import type { Request, Scenario } from './scenarios.mts'
import type { Server, ServerStats } from './server.mts'

export const LOADGEN = join(ROOT, 'loadgen', 'bin', 'loadgen')

export interface LoadOptions {
  connections: number
  threads: number
  pipeline?: number
  /** Let the driver's threads sleep. Only to show what that does. */
  block?: boolean
  warmupMs: number
  durationMs: number
  /** Requests per second, for an open loop. */
  rate?: number
  seed: number
  headers: HeaderProfile
}

/** What else a request carries: nothing much, or what a browser sends. */
export type HeaderProfile = 'minimal' | 'browser'

const HEADERS: Record<HeaderProfile, Record<string, string>> = {
  minimal: { Accept: 'application/json', 'User-Agent': 'navios-benchmark' },
  browser: {
    Accept: 'application/json, text/plain, */*',
    'Accept-Encoding': 'identity',
    'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
    'Cache-Control': 'no-cache',
    Cookie: 'session=3f1c9a7be2d04c58; theme=dark; consent=1; ab=variant-b',
    Origin: 'http://localhost:5173',
    Pragma: 'no-cache',
    Referer: 'http://localhost:5173/dashboard',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  },
}

export interface LatencyUs {
  mean: number
  min: number
  p50: number
  p75: number
  p90: number
  p99: number
  p999: number
  max: number
}

export interface LoadResult {
  seconds: number
  requests: number
  rps: number
  bytes: number
  statuses: Record<string, number>
  unexpected: number
  errors: number
  reconnects: number
  firstError?: string
  latencyUs: LatencyUs
  late: number
  threads: number
  busyShare: number
  perSecond: number[]
}

export interface Measurement extends LoadResult {
  /** CPU time of the server process per request, all of its threads together. */
  cpuUs: number
  /** Share of the time the server's main thread was running. */
  mainShare: number
  /** The same for all of its threads: more than 1 with parallel GC or JIT. */
  processShare: number
  flags: string[]
}

export function encode(request: Request, headers: HeaderProfile) {
  return {
    method: request.method,
    path: request.path,
    headers: { ...HEADERS[headers], ...request.headers },
    body: request.body === undefined ? '' : JSON.stringify(request.body),
  }
}

export function planOf(addr: string, requests: readonly Scenario[], options: LoadOptions) {
  return {
    addr,
    ...options,
    headers: undefined,
    rate: options.rate ?? 0,
    requests: requests.map((scenario) => ({
      name: scenario.id,
      ...encode(scenario.request, options.headers),
      status: scenario.status,
      weight: requests.length === 1 ? 1 : scenario.weight,
    })),
  }
}

/** The mixed workload: every scenario with a weight. */
export const MIX = scenarios.filter((scenario) => scenario.weight > 0)

export async function drive(
  plan: ReturnType<typeof planOf>,
  onEvent: (event: 'start' | 'end') => void = () => {},
): Promise<LoadResult> {
  if (!existsSync(LOADGEN)) {
    throw new Error(`${LOADGEN} is missing. Run yarn build:loadgen first.`)
  }
  return new Promise((resolve, reject) => {
    const child = spawn(LOADGEN, ['run'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let result: LoadResult | undefined
    let stderr = ''
    child.stderr.on('data', (data: Buffer) => (stderr += data.toString()))
    createInterface({ input: child.stdout }).on('line', (line) => {
      const event = JSON.parse(line) as { event: string }
      if (event.event === 'result') {
        result = event as unknown as LoadResult
      } else {
        onEvent(event.event as 'start' | 'end')
      }
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (result) {
        resolve(result)
      } else {
        reject(new Error(`loadgen exited with ${code}: ${stderr}`))
      }
    })
    child.stdin.end(JSON.stringify(plan))
  })
}

const total = (s: { user: number; system: number }) => s.user + s.system

export function usage(before: ServerStats, after: ServerStats) {
  const wallUs = (after.at - before.at) * 1000
  return {
    process: (total(after.cpu) - total(before.cpu)) / wallUs,
    main: (total(after.thread) - total(before.thread)) / wallUs,
  }
}

/** Below this, a closed loop has not kept the server busy. */
export const SATURATED = 0.9
/** Above this, the driver may have been what limits a closed loop. */
export const CLIENT_LIMIT = 0.85

export async function measure(
  server: Server,
  requests: readonly Scenario[],
  options: LoadOptions,
  /** Too few connections cannot keep a server busy, and are not meant to. */
  saturates = options.connections >= 64,
): Promise<Measurement> {
  let before: Promise<ServerStats> | undefined
  let after: Promise<ServerStats> | undefined
  const result = await drive(planOf(server.addr, requests, options), (event) => {
    if (event === 'start') {
      before = server.stats()
    } else {
      after = server.stats()
    }
  })
  const share = usage((await before)!, (await after)!)

  const flags: string[] = []
  if (result.unexpected > 0) {
    flags.push(`${result.unexpected} unexpected statuses`)
  }
  if (result.errors > 0) {
    flags.push(`${result.errors} errors (${result.firstError})`)
  }
  if (!options.rate) {
    if (saturates && share.main < SATURATED && !requests.some((scenario) => scenario.idle)) {
      flags.push(`server only ${Math.round(share.main * 100)} % busy`)
    }
    if (result.busyShare > CLIENT_LIMIT) {
      flags.push(`driver ${Math.round(result.busyShare * 100)} % busy`)
    }
  } else if (result.rps < options.rate * 0.97) {
    flags.push(`only ${Math.round(result.rps)} of ${options.rate} requests per second`)
  }
  return {
    ...result,
    cpuUs: (share.process * 1e6) / result.rps,
    mainShare: share.main,
    processShare: share.process,
    flags,
  }
}
