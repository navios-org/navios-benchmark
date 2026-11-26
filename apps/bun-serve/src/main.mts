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

/**
 * Bun.serve and its own router: the floor for every server that runs on it.
 * The validation is the same as everywhere, and nothing is serialised ahead.
 */
import type { z } from 'zod'

const created = { status: 201 }

function send<T>(schema: z.ZodType<T>, body: unknown, init?: ResponseInit) {
  return Response.json(validateResponses ? schema.parse(body) : body, init)
}

function invalid(error: z.ZodError) {
  return Response.json(problem(400, 'Bad Request', error.issues), { status: 400 })
}

function query(url: string) {
  const mark = url.indexOf('?')
  return mark < 0 ? {} : Object.fromEntries(new URLSearchParams(url.slice(mark + 1)))
}

const counter = new Counter()

async function wrap(name: string, next: () => Promise<Response>) {
  const response = await next()
  response.headers.set(name, '1')
  return response
}

Bun.serve({
  port,
  hostname: host,
  development: false,
  routes: {
    '/ping': { GET: () => send(schemas.pingResponse, getPing()) },
    '/users/:id': {
      GET: (req) => {
        const user = findUser(req.params.id)
        return user
          ? send(schemas.userResponse, user)
          : Response.json(problem(404, 'User not found'), { status: 404 })
      },
    },
    '/users': {
      POST: async (req) => {
        const body = schemas.createUserBody.safeParse(await req.json())
        return body.success
          ? send(schemas.userResponse, createUser(body.data), created)
          : invalid(body.error)
      },
    },
    '/search': {
      GET: (req) => {
        const params = schemas.searchQuery.safeParse(query(req.url))
        return params.success
          ? send(schemas.searchResponse, search(params.data))
          : invalid(params.error)
      },
    },
    '/orders': {
      POST: async (req) => {
        const body = schemas.orderBody.safeParse(await req.json())
        return body.success
          ? send(schemas.orderResponse, createOrder(body.data), created)
          : invalid(body.error)
      },
    },
    '/posts': {
      GET: (req) => {
        const params = schemas.postsQuery.safeParse(query(req.url))
        return params.success
          ? send(schemas.postsResponse, listPosts(params.data.page, params.data.pageSize, findUser))
          : invalid(params.error)
      },
    },
    '/catalog': { GET: () => send(schemas.catalogResponse, getCatalog()) },
    '/me': {
      GET: (req) => {
        const me = authenticate(req.headers.get('authorization'))
        return me
          ? send(schemas.meResponse, me)
          : Response.json(problem(401, 'Unauthorized'), { status: 401 })
      },
    },
    '/chain': {
      GET: () =>
        wrap('x-chain-1', () =>
          wrap('x-chain-2', () =>
            wrap('x-chain-3', async () => send(schemas.pingResponse, getPing())),
          ),
        ),
    },
    '/scoped': {
      GET: () => send(schemas.scopedResponse, openAudit(counter).record('read')),
    },
    '/io': {
      GET: async () => {
        await slowIo()
        return send(schemas.pingResponse, getPing())
      },
    },
    '/leak': { GET: () => send(schemas.leakResponse, getLeak()) },
  },
  fetch: () => Response.json(problem(404, 'Not Found'), { status: 404 }),
})
