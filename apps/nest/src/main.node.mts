import { NodeAdapter } from '@nestjs/platform-node'

import { bootstrap } from './bootstrap.mjs'

await bootstrap(new NodeAdapter())
