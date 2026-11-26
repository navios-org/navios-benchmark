import './polyfill.mjs'
import { host, port, validateResponses } from '@navios-benchmark/shared/host'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import type { FastifyEnvironment } from '@navios/adapter-fastify'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create<FastifyEnvironment>(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: [],
  validateResponses,
})
await app.init()
await app.listen({ port, host })
