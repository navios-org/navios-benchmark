import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { CONTENDERS } from './contenders.mts'
import { ROOT } from './server.mts'

export function output(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

/** The version a contender really loads, from where its app resolves it. */
export function versionOf(app: string, name: string): string {
  const require = createRequire(join(ROOT, 'apps', app, 'package.json'))
  for (const path of require.resolve.paths(name) ?? []) {
    try {
      return (
        JSON.parse(readFileSync(join(path, name, 'package.json'), 'utf8')) as { version: string }
      ).version
    } catch {
      // not there
    }
  }
  return 'unknown'
}

export function environment() {
  return {
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
    memoryGiB: Math.round(os.totalmem() / 2 ** 30),
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    node: process.version,
    bun: output(process.env.BUN_BIN ?? 'bun', ['--version']) ?? 'none',
    power:
      process.platform === 'darwin'
        ? (output('pmset', ['-g', 'batt'])?.match(/'(.*)'/)?.[1] ?? 'unknown')
        : 'unknown',
    versions: Object.fromEntries(
      CONTENDERS.filter((c) => c.versionOf).map((c) => [c.id, versionOf(c.app, c.versionOf!)]),
    ),
    zod: versionOf('navios', 'zod'),
  }
}

function sample() {
  return os.cpus().reduce(
    (sum, { times }) => ({
      idle: sum.idle + times.idle,
      total: sum.total + times.idle + times.user + times.sys + times.nice + times.irq,
    }),
    { idle: 0, total: 0 },
  )
}

/** How many cores were busy over a moment. */
export async function busyCores(ms = 250): Promise<number> {
  const before = sample()
  await sleep(ms)
  const after = sample()
  const share = 1 - (after.idle - before.idle) / Math.max(after.total - before.total, 1)
  return share * os.cpus().length
}

/** Waits for the machine to calm down, and says how calm it got. */
export async function quiet(limit: number, patienceMs: number): Promise<number> {
  const deadline = performance.now() + patienceMs
  for (;;) {
    const busy = await busyCores()
    if (busy <= limit || performance.now() > deadline) {
      return busy
    }
    await sleep(500)
  }
}

/** Keeps a Mac awake for as long as this process lives. */
export function keepAwake() {
  if (process.platform === 'darwin') {
    spawn('caffeinate', ['-dims', '-w', String(process.pid)], { stdio: 'ignore' }).unref()
  }
}
