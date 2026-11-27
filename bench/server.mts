/** Starting a contender, and talking to it over stdin (see shared/src/host.mts). */
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as sleep } from 'node:timers/promises'

import type { Contender, Mode } from './contenders.mts'

export const ROOT = join(import.meta.dirname, '..')

export interface ServerStats {
  at: number
  cpu: { user: number; system: number }
  thread: { user: number; system: number }
  memory: { rss: number; heapTotal: number; heapUsed: number; external: number }
}

export interface Server {
  contender: Contender
  addr: string
  pid: number
  /** From spawning the process to the first answer, in milliseconds. */
  startupMs: number
  stats(): Promise<ServerStats>
  gc(): Promise<ServerStats>
  stop(): Promise<void>
}

export interface Launch {
  command: string
  args: string[]
}

/** How a contender is started by default: its compiled modules, not bundled. */
export function launchOf(contender: Contender): Launch {
  const file = join(ROOT, 'apps', contender.app, 'dist', contender.entry)
  if (!existsSync(file)) {
    throw new Error(`${file} is missing. Run yarn build first.`)
  }
  return contender.runtime === 'node'
    ? { command: process.execPath, args: ['--expose-gc', file] }
    : { command: process.env.BUN_BIN ?? 'bun', args: [file] }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

function firstAnswer(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1')
    socket.on('connect', () => {
      socket.write(`GET /ping HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`)
    })
    socket.on('data', (data) => {
      resolve(data.toString('latin1').startsWith('HTTP/1.1 200'))
      socket.destroy()
    })
    socket.on('error', () => resolve(false))
    socket.on('close', () => resolve(false))
  })
}

export async function start(
  contender: Contender,
  mode: Mode,
  launch: Launch = launchOf(contender),
): Promise<Server> {
  const port = await freePort()
  const begin = performance.now()
  const child: ChildProcess = spawn(launch.command, launch.args, {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      ...contender.env,
      NODE_ENV: 'production',
      PORT: String(port),
      VALIDATE_RESPONSES: mode === 'full' ? '1' : '0',
    },
  })

  let stderr = ''
  let ended: string | null = null
  child.stderr!.on('data', (data: Buffer) => (stderr += data.toString()))
  child.on('error', (error) => (ended = error.message))
  child.on('exit', (code, signal) => (ended ??= `exited with ${code ?? signal}`))

  const waiting: ((stats: ServerStats) => void)[] = []
  const output: string[] = []
  createInterface({ input: child.stdout! }).on('line', (line) => {
    if (line.startsWith('{"command"')) {
      waiting.shift()?.(JSON.parse(line) as ServerStats)
    } else {
      output.push(line)
    }
  })

  while (!(await firstAnswer(port))) {
    if (ended !== null || performance.now() - begin > 15_000) {
      child.kill('SIGKILL')
      throw new Error(
        `${contender.id} (${mode}) did not start: ${ended ?? 'timed out'}\n${stderr}${output.join('\n')}`,
      )
    }
    await sleep(1)
  }
  const startupMs = performance.now() - begin

  const send = (command: string) =>
    new Promise<ServerStats>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${contender.id} did not answer ${command}: ${ended ?? stderr}`)),
        10_000,
      )
      waiting.push((stats) => {
        clearTimeout(timer)
        resolve(stats)
      })
      child.stdin!.write(`${command}\n`)
    })

  return {
    contender,
    addr: `127.0.0.1:${port}`,
    pid: child.pid!,
    startupMs,
    stats: () => send('stats'),
    gc: () => send('gc'),
    stop: () =>
      new Promise<void>((resolve) => {
        if (ended !== null) {
          resolve()
          return
        }
        child.once('exit', () => resolve())
        child.kill('SIGKILL')
      }),
  }
}
