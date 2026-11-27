import { ExpressAdapter } from '@nestjs/platform-express'

import { bootstrap } from './bootstrap.mjs'

await bootstrap(new ExpressAdapter())
