import { zValidator } from '@hono/zod-validator'
import {
  authenticate,
  Counter,
  createOrder,
  createUser,
  findUser,
  getCatalog,
  getLeak,
  getPing,
  listPosts,
  openAudit,
  problem,
  search,
  slowIo,
} from '@navios-benchmark/shared/data'
import { validateResponses } from '@navios-benchmark/shared/host'
import * as schemas from '@navios-benchmark/shared/schemas'
import { Hono } from 'hono'

import type { Me } from '@navios-benchmark/shared/schemas'
/** Hono with @hono/zod-validator; the responses are validated by hand. */
import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'

type Env = { Variables: { me: Me } }

export const app = new Hono<Env>()

function send<T>(c: Context<Env>, schema: z.ZodType<T>, body: unknown, status: 200 | 201 = 200) {
  return c.json((validateResponses ? schema.parse(body) : body) as object, status)
}

const auth: MiddlewareHandler<Env> = async (c, next) => {
  const me = authenticate(c.req.header('authorization'))
  if (!me) {
    return c.json(problem(401, 'Unauthorized'), 401)
  }
  c.set('me', me)
  await next()
}

const counter = new Counter()

const chain =
  (name: string): MiddlewareHandler<Env> =>
  async (c, next) => {
    await next()
    c.header(name, '1')
  }

app.get('/ping', (c) => send(c, schemas.pingResponse, getPing()))

app.get('/users/:id', (c) => {
  const user = findUser(c.req.param('id'))
  return user ? send(c, schemas.userResponse, user) : c.json(problem(404, 'User not found'), 404)
})

app.post('/users', zValidator('json', schemas.createUserBody), (c) =>
  send(c, schemas.userResponse, createUser(c.req.valid('json')), 201),
)

app.get('/search', zValidator('query', schemas.searchQuery), (c) =>
  send(c, schemas.searchResponse, search(c.req.valid('query'))),
)

app.post('/orders', zValidator('json', schemas.orderBody), (c) =>
  send(c, schemas.orderResponse, createOrder(c.req.valid('json')), 201),
)

app.get('/posts', zValidator('query', schemas.postsQuery), (c) => {
  const { page, pageSize } = c.req.valid('query')
  return send(c, schemas.postsResponse, listPosts(page, pageSize, findUser))
})

app.get('/catalog', (c) => send(c, schemas.catalogResponse, getCatalog()))

app.get('/me', auth, (c) => send(c, schemas.meResponse, c.get('me')))

app.get('/chain', chain('x-chain-1'), chain('x-chain-2'), chain('x-chain-3'), (c) =>
  send(c, schemas.pingResponse, getPing()),
)

app.get('/scoped', (c) => send(c, schemas.scopedResponse, openAudit(counter).record('read')))

app.get('/io', async (c) => {
  await slowIo()
  return send(c, schemas.pingResponse, getPing())
})

app.get('/leak', (c) => send(c, schemas.leakResponse, getLeak()))
