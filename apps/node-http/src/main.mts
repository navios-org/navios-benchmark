/**
 * node:http and nothing else: the floor for every server that runs on it. The
 * routing is as cheap as it can be, and the validation is the same as everywhere.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'

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

import type { z } from 'zod'

type Res = ServerResponse<IncomingMessage>

function write(res: Res, status: number, body: unknown) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function send<T>(res: Res, schema: z.ZodType<T>, body: unknown, status = 200) {
  write(res, status, validateResponses ? schema.parse(body) : body)
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('error', reject)
    req.on('end', () => {
      try {
        resolve(JSON.parse((chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks)).toString()))
      } catch (error) {
        reject(error)
      }
    })
  })
}

function invalid(res: Res, error: z.ZodError) {
  write(res, 400, problem(400, 'Bad Request', error.issues))
}

const counter = new Counter()

async function wrap(res: Res, name: string, next: () => Promise<unknown>) {
  const result = await next()
  res.setHeader(name, '1')
  return result
}

async function handle(req: IncomingMessage, res: Res) {
  const url = req.url!
  const mark = url.indexOf('?')
  const path = mark < 0 ? url : url.slice(0, mark)
  const query = mark < 0 ? '' : url.slice(mark + 1)

  if (req.method === 'POST') {
    switch (path) {
      case '/users': {
        const body = schemas.createUserBody.safeParse(await readJson(req))
        return body.success
          ? send(res, schemas.userResponse, createUser(body.data), 201)
          : invalid(res, body.error)
      }
      case '/orders': {
        const body = schemas.orderBody.safeParse(await readJson(req))
        return body.success
          ? send(res, schemas.orderResponse, createOrder(body.data), 201)
          : invalid(res, body.error)
      }
    }
  } else if (req.method === 'GET') {
    switch (path) {
      case '/ping':
        return send(res, schemas.pingResponse, getPing())
      case '/search': {
        const params = schemas.searchQuery.safeParse(Object.fromEntries(new URLSearchParams(query)))
        return params.success
          ? send(res, schemas.searchResponse, search(params.data))
          : invalid(res, params.error)
      }
      case '/posts': {
        const params = schemas.postsQuery.safeParse(Object.fromEntries(new URLSearchParams(query)))
        return params.success
          ? send(
              res,
              schemas.postsResponse,
              listPosts(params.data.page, params.data.pageSize, findUser),
            )
          : invalid(res, params.error)
      }
      case '/catalog':
        return send(res, schemas.catalogResponse, getCatalog())
      case '/me': {
        const me = authenticate(req.headers.authorization)
        return me
          ? send(res, schemas.meResponse, me)
          : write(res, 401, problem(401, 'Unauthorized'))
      }
      case '/chain': {
        const body = await wrap(res, 'x-chain-1', () =>
          wrap(res, 'x-chain-2', () => wrap(res, 'x-chain-3', async () => getPing())),
        )
        return send(res, schemas.pingResponse, body)
      }
      case '/scoped':
        return send(res, schemas.scopedResponse, openAudit(counter).record('read'))
      case '/io':
        await slowIo()
        return send(res, schemas.pingResponse, getPing())
      case '/leak':
        return send(res, schemas.leakResponse, getLeak())
    }
    if (path.startsWith('/users/')) {
      const user = findUser(decodeURIComponent(path.slice(7)))
      return user
        ? send(res, schemas.userResponse, user)
        : write(res, 404, problem(404, 'User not found'))
    }
  }
  write(res, 404, problem(404, 'Not Found'))
}

createServer((req, res) => {
  handle(req, res).catch(() => {
    write(res, 500, problem(500, 'Internal Server Error'))
  })
}).listen(port, host)
