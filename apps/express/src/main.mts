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
import express from 'express'

import type { Me } from '@navios-benchmark/shared/schemas'
/** Express 5 with its default settings, validating with Zod by hand. */
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { z } from 'zod'

const app = express()
app.use(express.json())

function send<T>(res: Response, schema: z.ZodType<T>, body: unknown, status = 200) {
  res.status(status).json(validateResponses ? schema.parse(body) : body)
}

function invalid(res: Response, error: z.ZodError) {
  res.status(400).json(problem(400, 'Bad Request', error.issues))
}

const auth: RequestHandler = (req, res, next) => {
  const me = authenticate(req.headers.authorization)
  if (!me) {
    res.status(401).json(problem(401, 'Unauthorized'))
    return
  }
  res.locals.me = me
  next()
}

const counter = new Counter()

const chain =
  (name: string): RequestHandler =>
  (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(name, '1')
    next()
  }

app.get('/ping', (_req, res) => {
  send(res, schemas.pingResponse, getPing())
})

app.get('/users/:id', (req, res) => {
  const user = findUser(req.params.id)
  if (!user) {
    res.status(404).json(problem(404, 'User not found'))
    return
  }
  send(res, schemas.userResponse, user)
})

app.post('/users', (req, res) => {
  const body = schemas.createUserBody.safeParse(req.body)
  if (!body.success) {
    invalid(res, body.error)
    return
  }
  send(res, schemas.userResponse, createUser(body.data), 201)
})

app.get('/search', (req, res) => {
  const query = schemas.searchQuery.safeParse(req.query)
  if (!query.success) {
    invalid(res, query.error)
    return
  }
  send(res, schemas.searchResponse, search(query.data))
})

app.post('/orders', (req, res) => {
  const body = schemas.orderBody.safeParse(req.body)
  if (!body.success) {
    invalid(res, body.error)
    return
  }
  send(res, schemas.orderResponse, createOrder(body.data), 201)
})

app.get('/posts', (req, res) => {
  const query = schemas.postsQuery.safeParse(req.query)
  if (!query.success) {
    invalid(res, query.error)
    return
  }
  send(res, schemas.postsResponse, listPosts(query.data.page, query.data.pageSize, findUser))
})

app.get('/catalog', (_req, res) => {
  send(res, schemas.catalogResponse, getCatalog())
})

app.get('/me', auth, (_req, res) => {
  send(res, schemas.meResponse, res.locals.me as Me)
})

app.get('/chain', chain('x-chain-1'), chain('x-chain-2'), chain('x-chain-3'), (_req, res) => {
  send(res, schemas.pingResponse, getPing())
})

app.get('/scoped', (_req, res) => {
  send(res, schemas.scopedResponse, openAudit(counter).record('read'))
})

app.get('/io', async (_req, res) => {
  await slowIo()
  send(res, schemas.pingResponse, getPing())
})

app.get('/leak', (_req, res) => {
  send(res, schemas.leakResponse, getLeak())
})

app.listen(port, host)
