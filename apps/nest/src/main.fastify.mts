import { FastifyAdapter } from '@nestjs/platform-fastify'

import { bootstrap } from './bootstrap.mjs'

await bootstrap(new FastifyAdapter())
