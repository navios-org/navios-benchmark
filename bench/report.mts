/**
 * Turns the rows of a run into RESULTS.md and a page to explore them. Every
 * figure is the median of the rounds, with the lowest and highest beside it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { CONTENDERS } from './contenders.mts'
import { page } from './report-page.mts'
import { scenarios } from './scenarios.mts'
import { disjoint, geomean, median, summarize } from './stats.mts'

import type { Calibration } from './calibrate.mts'
import type { Contender } from './contenders.mts'
import type { Results, ThroughputRow } from './run.mts'
import type { Summary } from './stats.mts'

export type Family = 'navios' | 'navios1' | 'nest' | 'library' | 'floor'

export function familyOf(contender: Contender): Family {
  if (contender.kind === 'floor') {
    return 'floor'
  }
  if (contender.app === 'navios') {
    return 'navios'
  }
  if (contender.app === 'navios-v1') {
    return 'navios1'
  }
  return contender.app === 'nest' ? 'nest' : 'library'
}

/** A clone (`id#2`) is the same contender under a second name. */
function base(id: string): Contender {
  const found = CONTENDERS.find((c) => c.id === id.replace(/#\d+$/, ''))
  if (!found) {
    throw new Error(`The results name ${id}, which is no contender`)
  }
  return found
}

export interface Point {
  suite: 'throughput' | 'latency' | 'connections' | 'startup' | 'memory'
  metric: string
  /** scenario, rate, connection count or packaging */
  variant: string
  mode: string
  contender: string
  title: string
  runtime: 'node' | 'bun'
  family: Family
  better: 'higher' | 'lower'
  unit: string
  median: number
  min: number
  max: number
  n: number
  flags: string[]
}

function group<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    groups.set(k, [...(groups.get(k) ?? []), row])
  }
  return groups
}

function point(
  rows: { contender: string; mode: string; flags: string[] }[],
  values: number[],
  fields: Omit<
    Point,
    'median' | 'min' | 'max' | 'n' | 'flags' | 'contender' | 'title' | 'runtime' | 'family' | 'mode'
  >,
): Point {
  const first = rows[0]!
  const contender = base(first.contender)
  const s = summarize(values)
  return {
    ...fields,
    mode: first.mode,
    contender: first.contender,
    title: first.contender.endsWith('#2') ? `${contender.title} (again)` : contender.title,
    runtime: contender.runtime,
    family: familyOf(contender),
    median: s.median,
    min: s.min,
    max: s.max,
    n: s.n,
    flags: [...new Set(rows.flatMap((row) => row.flags))],
  }
}

export function points(results: Results): Point[] {
  const out: Point[] = []
  const closed = (suite: 'throughput' | 'connections', rows: ThroughputRow[]) => {
    for (const same of group(
      rows,
      (r) => `${r.contender}|${r.mode}|${r.scenario}|${r.connections}`,
    ).values()) {
      const variant = suite === 'throughput' ? same[0]!.scenario : String(same[0]!.connections)
      out.push(
        point(
          same,
          same.map((r) => r.rps),
          { suite, metric: 'rps', variant, better: 'higher', unit: 'requests/s' },
        ),
        point(
          same,
          same.map((r) => r.cpuUs),
          { suite, metric: 'cpu', variant, better: 'lower', unit: 'µs of CPU per request' },
        ),
        point(
          same,
          same.map((r) => r.latencyUs.p99 / 1000),
          {
            suite,
            metric: 'p99',
            variant,
            better: 'lower',
            unit: 'ms, 99th percentile at saturation',
          },
        ),
      )
    }
  }
  closed('throughput', results.throughput)
  closed('connections', results.connections)

  for (const same of group(results.latency, (r) => `${r.contender}|${r.mode}|${r.rate}`).values()) {
    // A rate a contender could not sustain says nothing about its latency.
    if (same.some((r) => r.flags.some((f) => f.startsWith('only ')))) {
      continue
    }
    const variant = String(same[0]!.rate)
    for (const [metric, pick] of [
      ['p50', (r: (typeof same)[number]) => r.latencyUs.p50],
      ['p99', (r: (typeof same)[number]) => r.latencyUs.p99],
      ['p999', (r: (typeof same)[number]) => r.latencyUs.p999],
    ] as const) {
      out.push(
        point(
          same,
          same.map((r) => pick(r) / 1000),
          { suite: 'latency', metric, variant, better: 'lower', unit: 'ms' },
        ),
      )
    }
    out.push(
      point(
        same,
        same.map((r) => r.cpuUs),
        {
          suite: 'latency',
          metric: 'cpu',
          variant,
          better: 'lower',
          unit: 'µs of CPU per request',
        },
      ),
    )
  }

  for (const same of group(results.startup, (r) => `${r.contender}|${r.packaging}`).values()) {
    out.push(
      point(
        same.map((r) => ({ ...r, mode: 'full', flags: [] })),
        same.map((r) => r.ms),
        {
          suite: 'startup',
          metric: 'ms',
          variant: same[0]!.packaging,
          better: 'lower',
          unit: 'ms from spawn to the first answer',
        },
      ),
    )
  }

  for (const same of group(results.memory, (r) => r.contender).values()) {
    for (const metric of ['idleMiB', 'peakMiB', 'settledMiB'] as const) {
      out.push(
        point(
          same,
          same.map((r) => r[metric]),
          { suite: 'memory', metric, variant: '10000', better: 'lower', unit: 'MiB resident' },
        ),
      )
    }
  }
  return out
}

// ------------------------------------------------------------------ markdown

const fmt = (value: number, digits = 0) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const k = (value: number) =>
  value >= 1000 ? `${fmt(value / 1000, value >= 100_000 ? 0 : 1)}k` : fmt(value)
const pct = (ratio: number) => `${ratio >= 1 ? '+' : '−'}${fmt(Math.abs(ratio - 1) * 100)} %`
const spread = (s: Pick<Summary, 'median' | 'min' | 'max'>) =>
  `±${fmt(((s.max - s.min) / 2 / s.median) * 100, 1)} %`

function table(head: string[], rows: string[][], align: ('l' | 'r')[]): string {
  return [
    `| ${head.join(' | ')} |`,
    `| ${align.map((a) => (a === 'r' ? '---:' : '---')).join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function find(all: Point[], query: Partial<Point>): Point | undefined {
  return all.find((p) =>
    Object.entries(query).every(([key, value]) => p[key as keyof Point] === value),
  )
}

/** Scenarios that keep a server busy, which is where frameworks differ. */
const BUSY = scenarios.filter((s) => !s.idle).map((s) => s.id)

export function markdown(
  results: Results,
  calibration: Calibration | null,
  all: Point[],
  file: string,
): string {
  const env = results.environment
  const contenders = [...new Set(all.map((p) => p.contender))]
  const real = contenders.filter((c) => !c.includes('#'))
  const modes = [...new Set(results.throughput.map((r) => r.mode))]
  const mode = modes.includes('full') ? 'full' : modes[0]!
  const out: string[] = []
  const say = (...blocks: string[]) => out.push(...blocks.flatMap((block) => [block, '']))

  say(
    '# Results',
    `Measured ${new Date(results.startedAt).toLocaleDateString('en-CA')} on ${env.cpu} (${env.cores} cores, ${env.memoryGiB} GiB), ${env.os}, Node.js ${env.node}, Bun ${env.bun}, on ${env.power}. ` +
      `${results.options.rounds} rounds of ${results.options.durationMs / 1000} s per measurement, ${results.options.connections} connections, ` +
      `each round in a new process and a new random order. Every figure is the median of the rounds; ± is half of the range between the lowest and the highest.`,
    `Methodology, and how to run this yourself: [README.md](README.md). Every row of the run: [results/${file}](results/${file}). The same in charts: open \`results/report.html\` in a browser.`,
  )

  // ------------------------------------------------------------ throughput
  const rps = (c: string, s: string, m = mode) =>
    find(all, { suite: 'throughput', metric: 'rps', contender: c, variant: s, mode: m })
  const cpu = (c: string, s: string, m = mode) =>
    find(all, { suite: 'throughput', metric: 'cpu', contender: c, variant: s, mode: m })
  if (results.throughput.length > 0) {
    say(
      '## Throughput',
      `Requests per second with ${results.options.connections} connections, with requests and responses validated (\`${mode}\` mode). The floor of each runtime is a server with hand-written routing and the same validation.`,
    )

    const shown = scenarios.filter((s) => results.throughput.some((r) => r.scenario === s.id))
    const order = real.toSorted(
      (a, b) => (rps(b, 'param')?.median ?? 0) - (rps(a, 'param')?.median ?? 0),
    )
    for (const runtime of ['node', 'bun'] as const) {
      const here = order.filter((c) => base(c).runtime === runtime && rps(c, 'ping'))
      if (here.length === 0) {
        continue
      }
      say(
        `### ${runtime === 'node' ? 'Node.js' : 'Bun'}`,
        table(
          ['', ...shown.map((s) => s.id), 'mix'],
          here.map((c) => [
            base(c).title,
            ...shown.map((s) => (rps(c, s.id) ? k(rps(c, s.id)!.median) : 'n/a')),
            rps(c, 'mix') ? k(rps(c, 'mix')!.median) : '',
          ]),
          ['l', ...shown.map(() => 'r' as const), 'r'],
        ),
      )
    }
    say(
      'What the scenarios are:',
      table(
        ['', 'request', 'what it costs'],
        [
          ...shown.map((s) => [s.id, `\`${s.title}\``, s.measures]),
          [
            'mix',
            'all of the above but `ping`, `large`, `chain`, `scoped` and `io`',
            'weighted like an API: 40 % `param`, 15 % each `query` and `list`, …',
          ],
        ],
        ['l', 'l', 'l'],
      ),
    )

    // the summary: geometric means over the busy scenarios
    const relative = (c: string, reference: string) => {
      const ratios = BUSY.flatMap((s) => {
        const mine = rps(c, s)
        const theirs = rps(reference, s)
        return mine && theirs ? [mine.median / theirs.median] : []
      })
      return { ratio: ratios.length > 0 ? geomean(ratios) : Number.NaN, n: ratios.length }
    }
    const floorOf = (c: string) => (base(c).runtime === 'node' ? 'node-http' : 'bun-serve')
    const reference = real.includes('navios-fastify') ? 'navios-fastify' : real[0]!
    const ranked = real
      .map((c) => ({ c, ...relative(c, reference), floor: relative(c, floorOf(c)).ratio }))
      .filter((r) => Number.isFinite(r.ratio))
      .toSorted((a, b) => b.ratio - a.ratio)
    say(
      '### In one number',
      `Geometric means over every scenario but \`io\`: requests per second relative to ${base(reference).title}, and the share of the floor of its own runtime (\`node:http\` or \`Bun.serve\` with the same validation) that each contender keeps. Scenarios a contender does not support are left out of its means.`,
      table(
        [
          '',
          'runtime',
          'relative throughput',
          'share of its floor',
          'µs of CPU per request, `param`',
        ],
        ranked.map(({ c, ratio, n, floor }) => [
          base(c).title,
          base(c).runtime === 'node' ? 'Node.js' : 'Bun',
          `${fmt(ratio, 2)}×${n < BUSY.length ? ` (${n} scenarios)` : ''}`,
          Number.isFinite(floor) ? `${fmt(floor * 100)} %` : '',
          cpu(c, 'param') ? fmt(cpu(c, 'param')!.median, 1) : '',
        ]),
        ['l', 'l', 'r', 'r', 'r'],
      ),
    )

    // head to head
    const pairs: [string, string, string][] = [
      ['navios-fastify', 'fastify', 'Navios 2 against plain Fastify with the same Zod schemas'],
      ['navios-fastify', 'nest-node', 'Navios 2 on Fastify against Nest on its new Node adapter'],
      ['navios-fastify', 'nest-fastify', 'Navios 2 against Nest, both on Fastify'],
      ['navios-bun', 'navios-fastify', 'Navios 2 on Bun against Navios 2 on Fastify'],
      ['navios-fastify', 'navios1-fastify', 'Navios 2 against 1.x, on Fastify'],
      ['navios-bun', 'navios1-bun', 'Navios 2 against 1.x, on Bun'],
      ['navios-bun', 'elysia', 'Navios 2 against Elysia, on Bun'],
      ['navios-bun', 'hono-bun', 'Navios 2 against Hono, on Bun'],
      ['nest-node', 'nest-express', 'Nest: the Node adapter against Express'],
      ['nest-node', 'nest-fastify', 'Nest: the Node adapter against Fastify'],
      ['nest-node-bun', 'nest-node', 'Nest on its Node adapter: Bun against Node.js'],
    ]
    const heads = pairs.filter(([a, b]) => real.includes(a) && real.includes(b))
    if (heads.length > 0) {
      say(
        '### Head to head',
        'The difference in requests per second. A difference is marked ≈ when the ranges of the two overlap, so that the rounds do not tell them apart.',
        table(
          ['', ...shown.map((s) => s.id)],
          heads.map(([a, b, title]) => [
            title,
            ...shown.map((s) => {
              const x = rps(a, s.id)
              const y = rps(b, s.id)
              if (!x || !y) {
                return 'n/a'
              }
              return `${disjoint(x, y) ? '' : '≈ '}${pct(x.median / y.median)}`
            }),
          ]),
          ['l', ...shown.map(() => 'r' as const)],
        ),
      )
    }

    // validation cost
    if (modes.includes('request') && modes.includes('full')) {
      say(
        '### What validating responses costs',
        'Requests per second with responses sent as they are (`request` mode), against validating them too (`full` mode).',
        table(
          ['', ...shown.map((s) => s.id)],
          real
            .filter((c) => rps(c, 'param', 'request') && rps(c, 'param', 'full'))
            .toSorted(
              (a, b) =>
                base(a).runtime.localeCompare(base(b).runtime) ||
                rps(b, 'param')!.median - rps(a, 'param')!.median,
            )
            .map((c) => [
              base(c).title + (base(c).runtime === 'bun' ? ' (Bun)' : ''),
              ...shown.map((s) => {
                const x = rps(c, s.id, 'request')
                const y = rps(c, s.id, 'full')
                return x && y ? pct(x.median / y.median) : ''
              }),
            ]),
          ['l', ...shown.map(() => 'r' as const)],
        ),
      )
      const variants = real.filter((c) => base(c).modes.length === 1)
      if (variants.length > 0) {
        say(
          'Variants that exist in one mode only:',
          table(
            ['', 'mode', ...shown.map((s) => s.id)],
            variants.map((c) => {
              const m = base(c).modes[0]!
              return [
                `${base(c).title}: ${base(c).note ?? ''}`,
                m,
                ...shown.map((s) => (rps(c, s.id, m) ? k(rps(c, s.id, m)!.median) : 'n/a')),
              ]
            }),
            ['l', 'l', ...shown.map(() => 'r' as const)],
          ),
        )
      }
    }

    // noise
    const clones = contenders.filter((c) => c.endsWith('#2'))
    if (clones.length > 0) {
      const lines = clones.map((clone) => {
        const original = clone.replace('#2', '')
        const ratios = BUSY.flatMap((s) => {
          const x = rps(clone, s)
          const y = rps(original, s)
          return x && y ? [Math.abs(x.median / y.median - 1)] : []
        })
        return [
          base(original).title,
          `${fmt(median(ratios) * 100, 1)} %`,
          `${fmt(Math.max(...ratios) * 100, 1)} %`,
        ]
      })
      say(
        '### How much is noise',
        'Two contenders ran twice per round under different names, as if they were different servers. The difference between a contender and itself is what a difference between two contenders has to exceed.',
        table(['', 'median difference', 'largest difference'], lines, ['l', 'r', 'r']),
      )
    }

    const spreads = all
      .filter((p) => p.suite === 'throughput' && p.metric === 'rps')
      .map((p) => (p.max - p.min) / 2 / p.median)
    const flagged = all.filter(
      (p) => p.suite === 'throughput' && p.metric === 'rps' && p.flags.length > 0,
    )
    say(
      `Across all throughput figures, the median spread between rounds is ±${fmt(median(spreads) * 100, 1)} %.` +
        (flagged.length > 0
          ? ` These measurements carry a warning:\n\n${flagged.map((p) => `- ${p.title} (${p.runtime}), ${p.variant}, ${p.mode}: ${p.flags.join('; ')}`).join('\n')}`
          : ' No measurement carries a warning: the server was always saturated, the driver never was, and every answer had the expected status.'),
    )
  }

  // --------------------------------------------------------------- latency
  if (results.latency.length > 0) {
    const rates = [...new Set(results.latency.map((r) => r.rate))].toSorted((a, b) => a - b)
    const order = real.toSorted(
      (a, b) => (rps(b, 'mix')?.median ?? 0) - (rps(a, 'mix')?.median ?? 0),
    )
    say(
      '## Latency at a fixed rate',
      'The mixed workload sent at a fixed rate (an open loop, as real clients do), with latency measured from when each request was due, so that a stall delays the requests behind it too. Each cell is p50 / p99 in milliseconds; — is a rate the contender could not sustain.',
      table(
        ['', ...rates.map((r) => `${k(r)}/s`)],
        order
          .filter((c) => results.latency.some((r) => r.contender === c))
          .map((c) => [
            `${base(c).title}${base(c).runtime === 'bun' ? ' (Bun)' : ''}`,
            ...rates.map((rate) => {
              const p50 = find(all, {
                suite: 'latency',
                metric: 'p50',
                contender: c,
                variant: String(rate),
              })
              const p99 = find(all, {
                suite: 'latency',
                metric: 'p99',
                contender: c,
                variant: String(rate),
              })
              return p50 && p99 ? `${fmt(p50.median, 2)} / ${fmt(p99.median, 2)}` : '—'
            }),
          ]),
        ['l', ...rates.map(() => 'r' as const)],
      ),
    )
  }

  // ----------------------------------------------------------- connections
  if (results.connections.length > 0) {
    const counts = [...new Set(results.connections.map((r) => r.connections))].toSorted(
      (a, b) => a - b,
    )
    const order = real.toSorted(
      (a, b) => (rps(b, 'param')?.median ?? 0) - (rps(a, 'param')?.median ?? 0),
    )
    say(
      '## Connections',
      '`GET /users/:id` with 1 to 256 connections: requests per second, and the 99th percentile of latency in milliseconds. One connection is a client that waits for each answer; it shows the time of one request more than the capacity of the server.',
      table(
        ['', ...counts.map((n) => `${n}`)],
        order
          .filter((c) => results.connections.some((r) => r.contender === c))
          .map((c) => [
            `${base(c).title}${base(c).runtime === 'bun' ? ' (Bun)' : ''}`,
            ...counts.map((n) => {
              const r = find(all, {
                suite: 'connections',
                metric: 'rps',
                contender: c,
                variant: String(n),
              })
              const l = find(all, {
                suite: 'connections',
                metric: 'p99',
                contender: c,
                variant: String(n),
              })
              return r && l ? `${k(r.median)} · ${fmt(l.median, 2)}` : ''
            }),
          ]),
        ['l', ...counts.map(() => 'r' as const)],
      ),
    )
  }

  // --------------------------------------------------------------- startup
  if (results.startup.length > 0) {
    const kinds = ['modules', 'bundle', 'executable'].filter((kind) =>
      results.startup.some((r) => r.packaging === kind),
    )
    const ms = (c: string, kind: string) =>
      find(all, { suite: 'startup', contender: c, variant: kind })
    say(
      '## Startup',
      'Milliseconds from spawning the process to the first answer of `GET /ping`, median of ' +
        `${results.options.startups} starts in random order. \`modules\` runs the compiled files with \`node_modules\`; \`bundle\` is one file, built with rolldown for Node.js and \`bun build\` for Bun; \`executable\` is \`bun build --compile\`.`,
      table(
        ['', 'runtime', ...kinds],
        real
          .filter((c) => ms(c, 'modules'))
          .toSorted((a, b) => ms(a, 'modules')!.median - ms(b, 'modules')!.median)
          .map((c) => [
            base(c).title,
            base(c).runtime === 'node' ? 'Node.js' : 'Bun',
            ...kinds.map((kind) =>
              ms(c, kind) ? `${fmt(ms(c, kind)!.median)} ${spread(ms(c, kind)!)}` : '',
            ),
          ]),
        ['l', 'l', ...kinds.map(() => 'r' as const)],
      ),
    )
  }

  // ---------------------------------------------------------------- memory
  if (results.memory.length > 0) {
    const mem = (c: string, metric: string) => find(all, { suite: 'memory', contender: c, metric })
    say(
      '## Memory',
      `Resident memory in MiB: after start-up and a collection (idle), the most during ${results.options.memoryMs / 1000} s of the mixed workload at ${k(results.options.memoryRate)} requests per second, the same number of requests for everyone (peak), and after a collection again (settled).`,
      table(
        ['', 'runtime', 'idle', 'peak', 'settled'],
        real
          .filter((c) => mem(c, 'idleMiB'))
          .toSorted((a, b) => mem(a, 'idleMiB')!.median - mem(b, 'idleMiB')!.median)
          .map((c) => [
            base(c).title,
            base(c).runtime === 'node' ? 'Node.js' : 'Bun',
            fmt(mem(c, 'idleMiB')!.median),
            fmt(mem(c, 'peakMiB')!.median),
            fmt(mem(c, 'settledMiB')!.median),
          ]),
        ['l', 'l', 'r', 'r', 'r'],
      ),
    )
  }

  // ----------------------------------------------------------- calibration
  if (calibration) {
    const tools = [...new Set(calibration.tools.map((t) => t.tool))]
    const servers = [...new Set(calibration.tools.map((t) => t.server))]
    const cell = (tool: string, server: string) => {
      const row = calibration.tools.find((t) => t.tool === tool && t.server === server)
      return row ? `${k(row.rps)} (${fmt(row.mainShare * 100)} %)` : ''
    }
    say(
      '## The load driver',
      `Requests per second of \`GET /ping\` with ${64} connections, by tool, and in brackets how busy the server's main thread was. A server that is not fully busy was held back by the tool. One that is fully busy can still be slowed by it: on loopback the server's writes pay for waking the client's threads, so a client that sleeps costs the server time. The driver of this benchmark keeps its threads polling instead.`,
      table(
        ['', ...servers],
        tools.map((tool) => [tool, ...servers.map((server) => cell(tool, server))]),
        ['l', ...servers.map(() => 'r' as const)],
      ),
      `Against a single thread that answers without parsing anything, the driver reached ${calibration.sink.map((s) => `${k(s.rps)} with ${s.threads} thread${s.threads > 1 ? 's' : ''}`).join(', ')}. That is what the kernel allows one thread to serve; every server above is below it.`,
    )
  }

  // -------------------------------------------------------------- versions
  say(
    '## Versions',
    table(
      ['', 'version'],
      [
        ...Object.entries(env.versions)
          .filter(([id]) => real.includes(id))
          .map(([id, version]) => [
            base(id).title + (base(id).runtime === 'bun' ? ' (Bun)' : ''),
            version,
          ]),
        ['Zod', env.zod],
      ],
      ['l', 'l'],
    ),
  )
  if (results.failures.length > 0) {
    say('## Failures', ...results.failures.map((f) => `- ${f}`))
  }
  return out.join('\n')
}

export function report(file: string, calibrationFile: string, root: string) {
  const results = JSON.parse(readFileSync(file, 'utf8')) as Results
  const calibration = existsSync(calibrationFile)
    ? (JSON.parse(readFileSync(calibrationFile, 'utf8')) as Calibration)
    : null
  const all = points(results)
  writeFileSync(
    join(root, 'RESULTS.md'),
    `${markdown(results, calibration, all, basename(file))}\n`,
  )
  writeFileSync(join(root, 'results', 'report.html'), page(results, calibration, all))
  console.log(`Wrote RESULTS.md and results/report.html from ${basename(file)}`)
}
