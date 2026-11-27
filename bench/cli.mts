import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { calibrate } from './calibrate.mts'
import { check } from './conformance.mts'
import { contender, CONTENDERS, MODES } from './contenders.mts'
import { mergeFiles } from './merge.mts'
import { packageAll, packagedLaunch, PACKAGINGS } from './package.mts'
import { report } from './report.mts'
import { runAll, SUITES } from './run.mts'
import { scenario, scenarios } from './scenarios.mts'
import { ROOT } from './server.mts'

import type { Mode } from './contenders.mts'
import type { HeaderProfile } from './load.mts'
import type { Options, Suite } from './run.mts'

const RESULTS = join(ROOT, 'results')

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    preset: { type: 'string', default: 'standard' },
    suites: { type: 'string' },
    contenders: { type: 'string' },
    scenarios: { type: 'string' },
    modes: { type: 'string' },
    runtime: { type: 'string' },
    rounds: { type: 'string' },
    round: { type: 'string' },
    duration: { type: 'string' },
    warmup: { type: 'string' },
    connections: { type: 'string' },
    threads: { type: 'string' },
    pipeline: { type: 'string' },
    headers: { type: 'string' },
    rates: { type: 'string' },
    startups: { type: 'string' },
    clones: { type: 'string' },
    seed: { type: 'string' },
    packages: { type: 'boolean', default: false },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const HELP = `node bench/cli.mts <command> [options]

Commands
  list          contenders, scenarios and suites
  conformance   check that the servers give the same answers (--packages: and their packages)
  calibrate     check the load driver, and compare it with other tools
  package       build the bundles and executables for the startup suite
  run           measure; writes results/<time>.json
  report        [file] write the report of a run; the latest by default
  merge         <into> <from> [--round n] put the sessions of a run measured again into another

Options of run
  --preset quick|standard|full
  --suites ${SUITES.join(',')}
  --contenders navios-fastify,nest-node   --runtime node|bun
  --scenarios param,post                  --modes full,request
  --rounds 5   --duration 3 (s)   --warmup 3 (s)   --startups 20   --seed 1
  --connections 64   --threads 2   --pipeline 1   --headers minimal|browser
  --rates 5000,20000   --clones navios-fastify   --out file
`

function list(value: string | undefined): string[] | undefined {
  return value?.split(',').map((part) => part.trim())
}

function number(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${value} is not a number`)
  }
  return parsed
}

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`${name} ${value} is none of ${allowed.join(', ')}`)
  }
  return value as T
}

function selected() {
  const contenders = list(values.contenders)?.map(contender) ?? CONTENDERS
  return values.runtime
    ? contenders.filter((c) => c.runtime === oneOf('--runtime', values.runtime!, ['node', 'bun']))
    : contenders
}

const PRESETS = {
  quick: {
    rounds: 1,
    duration: 1.5,
    warmup: 2,
    startups: 5,
    suites: ['throughput', 'startup'],
    modes: ['full'],
    clones: [] as string[],
  },
  standard: {
    rounds: 3,
    duration: 3,
    warmup: 3,
    startups: 15,
    suites: SUITES as string[],
    modes: ['full'],
    clones: ['navios-fastify', 'navios-bun'],
  },
  full: {
    rounds: 5,
    duration: 3,
    warmup: 3,
    startups: 20,
    suites: SUITES as string[],
    modes: MODES as string[],
    clones: ['navios-fastify', 'navios-bun'],
  },
}

function options(): Options {
  const preset = PRESETS[oneOf('--preset', values.preset, ['quick', 'standard', 'full'])]
  return {
    suites: (list(values.suites) ?? preset.suites).map((s) => oneOf<Suite>('suite', s, SUITES)),
    contenders: selected(),
    scenarios: (list(values.scenarios) ?? scenarios.map((s) => s.id)).map(scenario),
    modes: (list(values.modes) ?? preset.modes).map((m) => oneOf<Mode>('mode', m, MODES)),
    rounds: number(values.rounds, preset.rounds),
    durationMs: number(values.duration, preset.duration) * 1000,
    warmupMs: number(values.warmup, preset.warmup) * 1000,
    connections: number(values.connections, 64),
    threads: number(values.threads, 2),
    pipeline: number(values.pipeline, 1),
    headers: oneOf<HeaderProfile>('--headers', values.headers ?? 'minimal', ['minimal', 'browser']),
    rates: list(values.rates)?.map(Number) ?? [5_000, 10_000, 20_000, 40_000, 80_000],
    connectionCounts: [1, 16, 64, 256],
    startups: number(values.startups, preset.startups),
    memoryRate: 10_000,
    memoryMs: 8_000,
    clones: list(values.clones) ?? preset.clones,
    seed: number(values.seed, 1),
  }
}

async function conformance(): Promise<number> {
  let failed = 0
  const line = (name: string, failures: { check: string; problem: string }[]) => {
    console.log(`${failures.length > 0 ? 'FAIL' : ' ok '} ${name}`)
    for (const failure of failures) {
      failed++
      console.log(`       ${failure.check}: ${failure.problem}`)
    }
  }
  for (const c of selected()) {
    for (const mode of c.modes) {
      for (const packaging of values.packages ? PACKAGINGS : (['modules'] as const)) {
        const launch = packagedLaunch(c, packaging)
        if (launch) {
          const name = `${c.id} (${mode}, ${packaging})`
          try {
            line(name, await check(c, mode, launch))
          } catch (error) {
            line(name, [{ check: 'start', problem: String(error) }])
          }
        }
      }
    }
  }
  console.log(failed === 0 ? '\nEvery server gives the same answers.' : `\n${failed} failures.`)
  return failed
}

function latest(): string {
  const file = readdirSync(RESULTS)
    .filter((name) => /^\d{4}-.*\.json$/.test(name))
    .toSorted()
    .at(-1)
  if (!file) {
    throw new Error('There are no results yet. Run yarn bench first.')
  }
  return join(RESULTS, file)
}

mkdirSync(RESULTS, { recursive: true })
switch (values.help ? 'help' : positionals[0]) {
  case 'list':
    console.log('Contenders')
    for (const c of CONTENDERS) {
      console.log(
        `  ${c.id.padEnd(18)} ${c.title.padEnd(32)} ${c.runtime.padEnd(5)} ${c.modes.join(', ')}`,
      )
    }
    console.log('\nScenarios')
    for (const s of scenarios) {
      console.log(`  ${s.id.padEnd(9)} ${s.title.padEnd(22)} ${s.measures}`)
    }
    console.log(`\nSuites  ${SUITES.join(', ')}`)
    break
  case 'conformance':
    process.exitCode = (await conformance()) === 0 ? 0 : 1
    break
  case 'calibrate':
    await calibrate(values.out ?? join(RESULTS, 'calibration.json'))
    break
  case 'package':
    await packageAll(selected())
    break
  case 'run': {
    const file =
      values.out ??
      join(RESULTS, `${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.json`)
    const results = await runAll(options(), file)
    for (const failure of results.failures) {
      console.error(failure)
    }
    console.log(`\nWrote ${file}`)
    process.exitCode = results.failures.length === 0 ? 0 : 1
    break
  }
  case 'merge':
    if (!positionals[1] || !positionals[2]) {
      throw new Error('merge needs the run to change and the run to take from')
    }
    mergeFiles(positionals[1], positionals[2], values.round ? number(values.round, 1) : undefined)
    break
  case 'report':
    report(positionals[1] ?? latest(), join(RESULTS, 'calibration.json'), ROOT)
    break
  default:
    console.log(HELP)
    process.exitCode = values.help ? 0 : 1
}
