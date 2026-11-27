/** What is measured: which program, on which runtime, with which settings. */
import type { ScenarioId } from './scenarios.mts'

/**
 * full: requests and responses are validated against the schemas.
 * request: only requests are; a response is serialised as it is.
 */
export type Mode = 'full' | 'request'
export const MODES: Mode[] = ['full', 'request']

export interface Contender {
  id: string
  title: string
  runtime: 'node' | 'bun'
  /** A floor has no framework; a library has routing; a framework has DI too. */
  kind: 'floor' | 'library' | 'framework'
  app: string
  entry: string
  env?: Record<string, string>
  modes: Mode[]
  /** Package whose version goes into the report. */
  versionOf?: string
  unsupported?: ScenarioId[]
  note?: string
}

const both: Mode[] = ['full', 'request']

export const CONTENDERS: Contender[] = [
  // ------------------------------------------------------------- Node.js
  {
    id: 'node-http',
    title: 'node:http',
    runtime: 'node',
    kind: 'floor',
    app: 'node-http',
    entry: 'main.mjs',
    modes: both,
  },
  {
    id: 'fastify',
    title: 'Fastify + Zod',
    runtime: 'node',
    kind: 'library',
    app: 'fastify',
    entry: 'main.mjs',
    modes: both,
    versionOf: 'fastify',
  },
  {
    id: 'fastify-json',
    title: 'Fastify + JSON Schema',
    runtime: 'node',
    kind: 'library',
    app: 'fastify',
    entry: 'main.mjs',
    env: { FASTIFY_SCHEMA: 'json' },
    modes: ['full'],
    versionOf: 'fastify',
    note: 'Ajv and fast-json-stringify in place of Zod: responses are shaped, not validated',
  },
  {
    id: 'express',
    title: 'Express',
    runtime: 'node',
    kind: 'library',
    app: 'express',
    entry: 'main.mjs',
    modes: both,
    versionOf: 'express',
  },
  {
    id: 'hono-node',
    title: 'Hono',
    runtime: 'node',
    kind: 'library',
    app: 'hono',
    entry: 'main.node.mjs',
    modes: both,
    versionOf: 'hono',
  },
  {
    id: 'navios-fastify',
    title: 'Navios 2 / Fastify',
    runtime: 'node',
    kind: 'framework',
    app: 'navios',
    entry: 'main.fastify.mjs',
    modes: both,
    versionOf: '@navios/server',
  },
  {
    id: 'navios1-fastify',
    title: 'Navios 1 / Fastify',
    runtime: 'node',
    kind: 'framework',
    app: 'navios-v1',
    entry: 'main.fastify.mjs',
    modes: both,
    versionOf: '@navios/core',
    unsupported: ['chain'],
    note: '1.x has no interceptors',
  },
  {
    id: 'nest-node',
    title: 'Nest / Node',
    runtime: 'node',
    kind: 'framework',
    app: 'nest',
    entry: 'main.node.mjs',
    modes: both,
    versionOf: '@nestjs/core',
  },
  {
    id: 'nest-fastify',
    title: 'Nest / Fastify',
    runtime: 'node',
    kind: 'framework',
    app: 'nest',
    entry: 'main.fastify.mjs',
    modes: both,
    versionOf: '@nestjs/core',
  },
  {
    id: 'nest-express',
    title: 'Nest / Express',
    runtime: 'node',
    kind: 'framework',
    app: 'nest',
    entry: 'main.express.mjs',
    modes: both,
    versionOf: '@nestjs/core',
  },
  {
    id: 'nest-node-class',
    title: 'Nest / Node + class-validator',
    runtime: 'node',
    kind: 'framework',
    app: 'nest',
    entry: 'main.node.mjs',
    env: { NEST_VALIDATOR: 'class' },
    modes: ['request'],
    versionOf: '@nestjs/core',
    note: 'DTO classes and ValidationPipe in place of Zod',
  },
  // ----------------------------------------------------------------- Bun
  {
    id: 'bun-serve',
    title: 'Bun.serve',
    runtime: 'bun',
    kind: 'floor',
    app: 'bun-serve',
    entry: 'main.mjs',
    modes: both,
  },
  {
    id: 'elysia',
    title: 'Elysia',
    runtime: 'bun',
    kind: 'library',
    app: 'elysia',
    entry: 'main.mjs',
    modes: both,
    versionOf: 'elysia',
  },
  {
    id: 'hono-bun',
    title: 'Hono',
    runtime: 'bun',
    kind: 'library',
    app: 'hono',
    entry: 'main.bun.mjs',
    modes: both,
    versionOf: 'hono',
  },
  {
    id: 'navios-bun',
    title: 'Navios 2 / Bun',
    runtime: 'bun',
    kind: 'framework',
    app: 'navios',
    entry: 'main.bun.mjs',
    modes: both,
    versionOf: '@navios/server',
  },
  {
    id: 'navios1-bun',
    title: 'Navios 1 / Bun',
    runtime: 'bun',
    kind: 'framework',
    app: 'navios-v1',
    entry: 'main.bun.mjs',
    modes: both,
    versionOf: '@navios/core',
    unsupported: ['chain'],
    note: '1.x has no interceptors',
  },
  {
    id: 'nest-node-bun',
    title: 'Nest / Node',
    runtime: 'bun',
    kind: 'framework',
    app: 'nest',
    entry: 'main.node.mjs',
    modes: both,
    versionOf: '@nestjs/core',
    note: 'On the node:http of Bun; Nest has no adapter for Bun.serve',
  },
  {
    id: 'nest-fastify-bun',
    title: 'Nest / Fastify',
    runtime: 'bun',
    kind: 'framework',
    app: 'nest',
    entry: 'main.fastify.mjs',
    modes: both,
    versionOf: '@nestjs/core',
    note: 'On the node:http of Bun; Nest has no adapter for Bun.serve',
  },
]

export function contender(id: string): Contender {
  const found = CONTENDERS.find((c) => c.id === id)
  if (!found) {
    throw new Error(`Unknown contender ${id}. There are ${CONTENDERS.map((c) => c.id).join(', ')}.`)
  }
  return found
}
