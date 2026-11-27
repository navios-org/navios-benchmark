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
import { Ajv } from 'ajv'
import addFormats from 'ajv-formats'
import { fastify } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type {
  CreateUser,
  Me,
  OrderInput,
  PostsQuery,
  SearchQuery,
} from '@navios-benchmark/shared/schemas'
/**
 * Fastify as it is used with Zod (fastify-type-provider-zod), or, with
 * FASTIFY_SCHEMA=json, with its own JSON Schema validation and serialisation.
 * The JSON Schemas are generated from the same Zod schemas.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    user: Me | null
  }
}

const jsonSchema = process.env.FASTIFY_SCHEMA === 'json'

const app = fastify({ logger: false })
if (jsonSchema) {
  // Fastify's own Ajv coerces bodies too, so that a number passes for a name.
  // Only a query string, where everything is text, is coerced here, as in the
  // other servers. The other options are Fastify's defaults.
  const options = { useDefaults: true, removeAdditional: true, allErrors: false }
  const strict = addFormats.default(new Ajv(options))
  const coercing = addFormats.default(new Ajv({ ...options, coerceTypes: 'array' }))
  app.setValidatorCompiler(({ schema, httpPart }) =>
    (httpPart === 'body' ? strict : coercing).compile(schema as object),
  )
} else {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
}

const input = (schema: z.ZodType) =>
  jsonSchema ? z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) : schema
const output = (schema: z.ZodType) =>
  jsonSchema ? z.toJSONSchema(schema, { target: 'draft-7', io: 'output' }) : schema
const response = (schema: z.ZodType, status = 200) =>
  validateResponses ? { response: { [status]: output(schema) } } : {}

/** z.coerce has no type on its input side, which is what Ajv is to coerce to. */
const coerced = (schema: z.ZodType) =>
  jsonSchema
    ? { ...z.toJSONSchema(schema, { target: 'draft-7', io: 'output' }), required: undefined }
    : schema
const searchQuery = jsonSchema
  ? { ...(coerced(schemas.searchQuery) as object), required: ['q'] }
  : schemas.searchQuery
const postsQuery = jsonSchema
  ? { ...(coerced(schemas.postsQuery) as object), required: [] }
  : schemas.postsQuery

app.decorateRequest('user', null)

async function auth(request: FastifyRequest, reply: FastifyReply) {
  request.user = authenticate(request.headers.authorization)
  if (!request.user) {
    return reply.code(401).send(problem(401, 'Unauthorized'))
  }
}

const counter = new Counter()

const chain = (name: string) => async (_request: FastifyRequest, reply: FastifyReply) => {
  reply.header(name, '1')
}

app.get('/ping', { schema: response(schemas.pingResponse) }, async () => getPing())

app.get<{ Params: { id: string } }>(
  '/users/:id',
  { schema: response(schemas.userResponse) },
  async (request, reply) => {
    const user = findUser(request.params.id)
    if (!user) {
      reply.code(404)
      return problem(404, 'User not found')
    }
    return user
  },
)

app.post<{ Body: CreateUser }>(
  '/users',
  { schema: { body: input(schemas.createUserBody), ...response(schemas.userResponse, 201) } },
  async (request, reply) => {
    reply.code(201)
    return createUser(request.body)
  },
)

app.get<{ Querystring: SearchQuery }>(
  '/search',
  { schema: { querystring: searchQuery, ...response(schemas.searchResponse) } },
  async (request) => search(request.query),
)

app.post<{ Body: OrderInput }>(
  '/orders',
  { schema: { body: input(schemas.orderBody), ...response(schemas.orderResponse, 201) } },
  async (request, reply) => {
    reply.code(201)
    return createOrder(request.body)
  },
)

app.get<{ Querystring: PostsQuery }>(
  '/posts',
  { schema: { querystring: postsQuery, ...response(schemas.postsResponse) } },
  async (request) => listPosts(request.query.page, request.query.pageSize, findUser),
)

app.get('/catalog', { schema: response(schemas.catalogResponse) }, async () => getCatalog())

app.get(
  '/me',
  { schema: response(schemas.meResponse), preHandler: auth },
  async (request) => request.user!,
)

app.get(
  '/chain',
  {
    schema: response(schemas.pingResponse),
    onSend: [chain('x-chain-1'), chain('x-chain-2'), chain('x-chain-3')],
  },
  async () => getPing(),
)

app.get('/scoped', { schema: response(schemas.scopedResponse) }, async () =>
  openAudit(counter).record('read'),
)

app.get('/io', { schema: response(schemas.pingResponse) }, async () => {
  await slowIo()
  return getPing()
})

app.get('/leak', { schema: response(schemas.leakResponse) }, async () => getLeak())

await app.listen({ port, host })
