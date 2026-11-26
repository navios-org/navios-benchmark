import { host, port, validateResponses } from '@navios-benchmark/shared/host'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: false,
  validateResponses: validateResponses ? 'always' : 'never',
})
await app.listen({ port, host })
