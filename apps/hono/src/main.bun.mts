import { host, port } from '@navios-benchmark/shared/host'

import { app } from './app.mjs'

Bun.serve({ fetch: app.fetch, port, hostname: host })
