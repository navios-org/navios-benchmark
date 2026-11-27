/** Elysia with the same Zod schemas, through its Standard Schema support. */
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
import { host, port, validateResponses } from '@navios-benchmark/shared/host'
import * as schemas from '@navios-benchmark/shared/schemas'
import { Elysia } from 'elysia'

import type { z } from 'zod'

const counter = new Counter()

/** Typed as no hook at all, because whether there is one is decided at run time. */
const response = (schema: z.ZodType, status = 200): {} =>
  validateResponses ? { response: { [status]: schema } } : {}

const account = new Elysia()
  .resolve(({ headers, status }) => {
    const me = authenticate(headers.authorization)
    return me ? { me } : status(401, problem(401, 'Unauthorized'))
  })
  .get('/me', ({ me }) => me, response(schemas.meResponse))

new Elysia({ serve: { hostname: host } })
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      // A response that fails its schema is the server's fault.
      const status = error.type === 'response' ? 500 : 400
      set.status = status
      return problem(status, 'Validation failed', error.all)
    }
  })
  .get('/ping', () => getPing(), response(schemas.pingResponse))
  .get(
    '/users/:id',
    ({ params, status }) => findUser(params.id) ?? status(404, problem(404, 'User not found')),
    response(schemas.userResponse),
  )
  .post('/users', ({ body, status }) => status(201, createUser(body)), {
    body: schemas.createUserBody,
    ...response(schemas.userResponse, 201),
  })
  .get('/search', ({ query }) => search(query), {
    query: schemas.searchQuery,
    ...response(schemas.searchResponse),
  })
  .post('/orders', ({ body, status }) => status(201, createOrder(body)), {
    body: schemas.orderBody,
    ...response(schemas.orderResponse, 201),
  })
  .get('/posts', ({ query }) => listPosts(query.page, query.pageSize, findUser), {
    query: schemas.postsQuery,
    ...response(schemas.postsResponse),
  })
  .get('/catalog', () => getCatalog(), response(schemas.catalogResponse))
  .use(account)
  .get('/chain', () => getPing(), {
    ...response(schemas.pingResponse),
    afterHandle: [
      ({ set }) => void (set.headers['x-chain-1'] = '1'),
      ({ set }) => void (set.headers['x-chain-2'] = '1'),
      ({ set }) => void (set.headers['x-chain-3'] = '1'),
    ],
  })
  .get('/scoped', () => openAudit(counter).record('read'), response(schemas.scopedResponse))
  .get(
    '/io',
    async () => {
      await slowIo()
      return getPing()
    },
    response(schemas.pingResponse),
  )
  .get('/leak', () => getLeak(), response(schemas.leakResponse))
  .listen(port)
