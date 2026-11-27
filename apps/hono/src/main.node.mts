import { serve } from '@hono/node-server'
import { host, port } from '@navios-benchmark/shared/host'

import { app } from './app.mjs'

serve({ fetch: app.fetch, port, hostname: host })
