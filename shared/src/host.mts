/**
 * How the runner talks to a server: one command per line on stdin, one JSON
 * line per answer on stdout. Nothing goes through HTTP, so measuring does not
 * add routes to a server or requests to a run, and it works the same on Node,
 * on Bun and in a compiled executable.
 */
declare const Bun: { gc(force: boolean): void } | undefined

export const port = Number(process.env.PORT ?? 3000)
export const host = '127.0.0.1'

/** Whether responses are validated against their schema before they are sent. */
export const validateResponses = process.env.VALIDATE_RESPONSES !== '0'

function collect() {
  if (typeof Bun !== 'undefined') {
    Bun.gc(true)
  } else {
    ;(globalThis as { gc?: () => void }).gc?.()
  }
}

function stats() {
  return {
    at: performance.now(),
    cpu: process.cpuUsage(),
    thread: process.threadCpuUsage(),
    memory: process.memoryUsage(),
  }
}

let pending = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => {
  pending += chunk
  for (let end = pending.indexOf('\n'); end >= 0; end = pending.indexOf('\n')) {
    const command = pending.slice(0, end)
    pending = pending.slice(end + 1)
    if (command === 'gc') {
      collect()
      collect()
    }
    process.stdout.write(`${JSON.stringify({ command, ...stats() })}\n`)
  }
})
// The runner is gone, also when it was killed: leave no server behind.
process.stdin.on('end', () => process.exit(0))
