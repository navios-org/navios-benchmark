import { host, port, validateResponses } from '@navios-benchmark/shared/host'
import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
  logger: false,
  validateResponses: validateResponses ? 'always' : 'never',
})
await app.listen({ port, hostname: host })
