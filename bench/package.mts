/**
 * The ways to ship a contender besides its compiled modules.
 *
 * Nothing is minified: Navios 1 tells classes apart by their names. And nothing
 * is shaken: rolldown takes the `Symbol.metadata ??= …` that decorators need,
 * of Navios 2 and of the polyfill for 1, for a statement without effect.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { rolldown } from 'rolldown'

import { CONTENDERS } from './contenders.mts'
import { launchOf, ROOT } from './server.mts'

import type { Contender } from './contenders.mts'
import type { Launch } from './server.mts'

export type Packaging = 'modules' | 'bundle' | 'executable'
export const PACKAGINGS: Packaging[] = ['modules', 'bundle', 'executable']

/** Optional packages that Nest looks for and does not need here. */
const NEST_OPTIONAL = [
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module.js',
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module.js',
  '@nestjs/platform-socket.io',
  '@fastify/static',
  '@fastify/view',
  'class-transformer/storage',
]

const dir = join(ROOT, 'packages')
const bundleOf = (contender: Contender) => join(dir, contender.id, 'server.mjs')
const executableOf = (contender: Contender) => join(dir, contender.id, 'server')

export function packagedLaunch(contender: Contender, packaging: Packaging): Launch | null {
  if (packaging === 'modules') {
    return launchOf(contender)
  }
  if (packaging === 'bundle') {
    const file = bundleOf(contender)
    if (!existsSync(file)) {
      return null
    }
    return contender.runtime === 'node'
      ? { command: process.execPath, args: ['--expose-gc', file] }
      : { command: process.env.BUN_BIN ?? 'bun', args: [file] }
  }
  const file = executableOf(contender)
  return existsSync(file) ? { command: file, args: [] } : null
}

async function bundleForNode(contender: Contender) {
  const bundle = await rolldown({
    input: join(ROOT, 'apps', contender.app, 'dist', contender.entry),
    platform: 'node',
    external: NEST_OPTIONAL,
    treeshake: false,
    logLevel: 'silent',
  })
  await bundle.write({
    file: bundleOf(contender),
    format: 'esm',
    codeSplitting: false,
  })
  await bundle.close()
}

function bundleForBun(contender: Contender, executable: boolean) {
  execFileSync(
    process.env.BUN_BIN ?? 'bun',
    [
      'build',
      '--target=bun',
      '--env=disable',
      ...NEST_OPTIONAL.flatMap((name) => ['--external', name]),
      ...(executable ? ['--compile'] : []),
      `--outfile=${executable ? executableOf(contender) : bundleOf(contender)}`,
      join(ROOT, 'apps', contender.app, 'dist', contender.entry),
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], cwd: ROOT },
  )
}

export async function packageAll(contenders: Contender[] = CONTENDERS) {
  mkdirSync(dir, { recursive: true })
  for (const contender of contenders) {
    const kinds: Packaging[] = contender.runtime === 'bun' ? ['bundle', 'executable'] : ['bundle']
    for (const kind of kinds) {
      try {
        if (contender.runtime === 'node') {
          await bundleForNode(contender)
        } else {
          bundleForBun(contender, kind === 'executable')
        }
        console.log(`${contender.id.padEnd(18)} ${kind}`)
      } catch (error) {
        console.log(`${contender.id.padEnd(18)} ${kind} failed: ${String(error).slice(0, 300)}`)
      }
    }
  }
}
