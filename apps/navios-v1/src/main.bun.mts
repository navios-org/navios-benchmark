import './polyfill.mjs'
import { host, port, validateResponses } from '@navios-benchmark/shared/host'
import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

import type { BunEnvironment } from '@navios/adapter-bun'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create<BunEnvironment>(AppModule, {
  adapter: defineBunEnvironment(),
  logger: [],
  validateResponses,
})
await app.init()
await app.listen({ port, hostname: host })
