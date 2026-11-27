import { ANY, DEFAULTED, LEAK, REJECTED, scenarios } from './scenarios.mts'
import { start } from './server.mts'

/**
 * Whether the servers are comparable at all: the same answers, the same inputs
 * refused, and responses validated where the mode says so. A benchmark between
 * servers that do different work measures the difference in work.
 */
import type { Contender, Mode } from './contenders.mts'
import type { Request, Scenario } from './scenarios.mts'
import type { Launch } from './server.mts'

export interface Failure {
  contender: string
  mode: Mode
  check: string
  problem: string
}

export function supported(contender: Contender, scenario: Scenario): boolean {
  return !contender.unsupported?.some((id) => id === scenario.id)
}

async function call(addr: string, request: Request) {
  const response = await fetch(`http://${addr}${request.path}`, {
    method: request.method,
    headers: request.headers,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  })
  const text = await response.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = undefined
  }
  return { status: response.status, headers: response.headers, text, body }
}

/** The path of the first difference, or null. */
export function difference(actual: unknown, expected: unknown, path = '$'): string | null {
  if (expected === ANY) {
    return actual === undefined ? `${path} is missing` : null
  }
  if (typeof expected !== 'object' || expected === null) {
    return Object.is(actual, expected)
      ? null
      : `${path} is ${JSON.stringify(actual)}, not ${JSON.stringify(expected)}`
  }
  if (
    typeof actual !== 'object' ||
    actual === null ||
    Array.isArray(actual) !== Array.isArray(expected)
  ) {
    return `${path} is ${JSON.stringify(actual)?.slice(0, 60)}`
  }
  const left = actual as Record<string, unknown>
  const right = expected as Record<string, unknown>
  for (const key of Object.keys(right)) {
    const found = difference(left[key], right[key], `${path}.${key}`)
    if (found) {
      return found
    }
  }
  const extra = Object.keys(left).find((key) => !(key in right))
  return extra === undefined ? null : `${path}.${extra} should not be there`
}

const count = (got: { body: unknown }) => (got.body as { requests?: number })?.requests ?? 0

export async function check(contender: Contender, mode: Mode, launch?: Launch): Promise<Failure[]> {
  const failures: Failure[] = []
  const fail = (what: string, problem: string) =>
    failures.push({ contender: contender.id, mode, check: what, problem })

  const server = await start(contender, mode, launch)
  try {
    for (const scenario of scenarios) {
      if (!supported(contender, scenario)) {
        continue
      }
      // Twice, because the second request is the first on a warm path.
      for (let i = 0; i < 2; i++) {
        const got = await call(server.addr, scenario.request)
        if (got.status !== scenario.status) {
          fail(
            scenario.id,
            `status ${got.status}, not ${scenario.status}: ${got.text.slice(0, 200)}`,
          )
          break
        }
        if (!/^application\/([a-z]+\+)?json\b/.test(got.headers.get('content-type') ?? '')) {
          fail(scenario.id, `content type ${got.headers.get('content-type')}`)
        }
        if (scenario.body !== undefined) {
          const found = difference(got.body, scenario.body)
          if (found) {
            fail(scenario.id, found)
          }
        }
        if (scenario.id === 'chain') {
          for (const name of ['x-chain-1', 'x-chain-2', 'x-chain-3']) {
            if (got.headers.get(name) !== '1') {
              fail(scenario.id, `no ${name} header`)
            }
          }
        }
      }
    }

    const first = await call(server.addr, scenarios.find((s) => s.id === 'scoped')!.request)
    const second = await call(server.addr, scenarios.find((s) => s.id === 'scoped')!.request)
    if (count(second) - count(first) !== 1) {
      fail('scoped', 'the request-scoped services are not built once per request')
    }

    const denied = await call(server.addr, { method: 'GET', path: '/me' })
    if (denied.status !== 401 && denied.status !== 403) {
      fail('auth', `a request without a token got ${denied.status}`)
    }

    for (const { name, request } of REJECTED) {
      const got = await call(server.addr, request)
      // Elysia and Hono answer with 422 in other set-ups; here 400 is agreed on.
      if (got.status !== 400) {
        fail(name, `status ${got.status}, not 400`)
      }
    }

    const defaulted = await call(server.addr, DEFAULTED.request)
    for (const [key, value] of Object.entries(DEFAULTED.expected)) {
      const actual = (defaulted.body as Record<string, unknown> | undefined)?.[key]
      if (actual !== value) {
        fail('defaults', `${key} is ${JSON.stringify(actual)}, not ${JSON.stringify(value)}`)
      }
    }

    const leak = await call(server.addr, LEAK.request)
    const leaked = leak.text.includes('secret')
    if (leaked !== LEAK.leaks(mode)) {
      fail(
        'leak',
        leaked
          ? 'a field that the response schema does not declare was sent'
          : 'responses are validated although the mode says they are not',
      )
    }

    const unknown = await call(server.addr, { method: 'GET', path: '/nothing/here' })
    if (unknown.status !== 404) {
      fail('not found', `status ${unknown.status}`)
    }
  } finally {
    await server.stop()
  }
  return failures
}
