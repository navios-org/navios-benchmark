/** The requests that are sent, and what has to come back. */
import type { Mode } from './contenders.mts'

export interface Request {
  method: 'GET' | 'POST'
  path: string
  headers?: Record<string, string>
  body?: unknown
}

export interface Scenario {
  id: string
  title: string
  /** What it costs a server that the others do not. */
  measures: string
  request: Request
  status: number
  /** The whole body, where every server has to send the same. */
  body?: unknown
  /** Share of the mixed workload. */
  weight: number
  /** Waits more than it works, so that it cannot keep a server busy. */
  idle?: boolean
}

const TIMESTAMP = '2026-01-15T10:30:00.000Z'
const json = { 'content-type': 'application/json' }
/** Stands for a value that differs from request to request. */
export const ANY = Symbol('any')

const users = (id: number) => ({
  id: String(id),
  name: `User ${id}`,
  email: `user${id}@example.com`,
  role: (id - 1) % 10 === 0 ? 'admin' : 'member',
  createdAt: TIMESTAMP,
})

const order = {
  customer: {
    id: 'cus_812',
    email: 'grace@example.com',
    address: { street: '1 Harbour Road', city: 'Arlington', zip: '22201', country: 'US' },
  },
  items: Array.from({ length: 10 }, (_, i) => ({
    sku: `SKU-${1000 + i}`,
    quantity: i + 1,
    unitPrice: 5 + i * 2.5,
    tags: ['standard', `shelf-${i}`],
  })),
  coupon: 'SPRING',
  giftWrap: true,
}

export const SCENARIOS = [
  {
    id: 'ping',
    title: 'GET /ping',
    measures: 'The framework itself: 15 bytes of JSON, no input',
    request: { method: 'GET', path: '/ping' },
    status: 200,
    body: { status: 'ok' },
    weight: 0,
  },
  {
    id: 'param',
    title: 'GET /users/:id',
    measures: 'A path parameter and a service',
    request: { method: 'GET', path: '/users/42' },
    status: 200,
    body: users(42),
    weight: 40,
  },
  {
    id: 'query',
    title: 'GET /search?…',
    measures: 'Four query parameters, coerced and validated',
    request: { method: 'GET', path: '/search?q=benchmark&page=2&limit=20&sort=desc' },
    status: 200,
    body: {
      query: 'benchmark',
      page: 2,
      limit: 20,
      sort: 'desc',
      total: 5,
      results: ['first', 'second', 'third', 'fourth', 'fifth'].map((word, i) => ({
        id: String(i + 1),
        title: `The ${word} result`,
        score: 1 - i / 10,
      })),
    },
    weight: 15,
  },
  {
    id: 'post',
    title: 'POST /users',
    measures: 'A small JSON body, validated',
    request: {
      method: 'POST',
      path: '/users',
      headers: json,
      body: { name: 'Grace Hopper', email: 'grace@example.com', age: 45 },
    },
    status: 201,
    body: {
      id: ANY,
      name: 'Grace Hopper',
      email: 'grace@example.com',
      role: 'member',
      createdAt: TIMESTAMP,
    },
    weight: 10,
  },
  {
    id: 'order',
    title: 'POST /orders',
    measures: 'A nested JSON body of 1 KB, validated',
    request: { method: 'POST', path: '/orders', headers: json, body: order },
    status: 201,
    body: {
      id: ANY,
      customerId: 'cus_812',
      status: 'pending',
      giftWrap: true,
      itemCount: 55,
      total: order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      lines: order.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        amount: item.quantity * item.unitPrice,
      })),
      createdAt: TIMESTAMP,
    },
    weight: 5,
  },
  {
    id: 'list',
    title: 'GET /posts',
    measures: 'Two services and a page of 20 records',
    request: { method: 'GET', path: '/posts?page=2&pageSize=20' },
    status: 200,
    body: {
      posts: Array.from({ length: 20 }, (_, i) => {
        const id = 21 + i
        const author = ((id - 1) % 50) + 1
        return {
          id: String(id),
          title: `Post ${id}`,
          content: `This is the content of post ${id}. It contains some text for benchmarking.`,
          author: { id: String(author), name: `User ${author}` },
        }
      }),
      total: 200,
      page: 2,
      pageSize: 20,
    },
    weight: 15,
  },
  {
    id: 'large',
    title: 'GET /catalog',
    measures: '31 KB of JSON: 100 nested records',
    request: { method: 'GET', path: '/catalog' },
    status: 200,
    body: {
      items: Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        description: `A description of item ${i + 1} that is long enough to be a realistic line of a product catalog.`,
        price: 10 + i / 4,
        metadata: {
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
          tags: ['benchmark', 'catalog', `tag-${i % 10}`],
          score: (i % 100) / 10,
        },
      })),
    },
    weight: 0,
  },
  {
    id: 'auth',
    title: 'GET /me',
    measures: 'A guard that reads a header and hands a user to the handler',
    request: {
      method: 'GET',
      path: '/me',
      headers: { authorization: 'Bearer benchmark-token' },
    },
    status: 200,
    body: { id: '7', name: 'Ada', roles: ['admin', 'editor'] },
    weight: 10,
  },
  {
    id: 'chain',
    title: 'GET /chain',
    measures: 'Three interceptors (or hooks, or middlewares) that each set a header',
    request: { method: 'GET', path: '/chain' },
    status: 200,
    body: { status: 'ok' },
    weight: 0,
  },
  {
    id: 'scoped',
    title: 'GET /scoped',
    measures:
      'Two request-scoped services: built by the container, or with `new` where there is none',
    request: { method: 'GET', path: '/scoped' },
    status: 200,
    body: { requests: ANY, entries: 1 },
    weight: 0,
  },
  {
    id: 'invalid',
    title: 'POST /users (400)',
    measures: 'A body that fails validation in two places',
    request: {
      method: 'POST',
      path: '/users',
      headers: json,
      body: { name: '', email: 'not an address', age: 45 },
    },
    status: 400,
    weight: 2,
  },
  {
    id: 'missing',
    title: 'GET /users/:id (404)',
    measures:
      'A 404: thrown by a service and mapped where there are services, returned by the handler elsewhere',
    request: { method: 'GET', path: '/users/0' },
    status: 404,
    weight: 3,
  },
  {
    id: 'io',
    title: 'GET /io',
    measures: 'A handler that awaits 5 ms, as for a database',
    request: { method: 'GET', path: '/io' },
    status: 200,
    body: { status: 'ok' },
    weight: 0,
    idle: true,
  },
] as const satisfies Scenario[]

export type ScenarioId = (typeof SCENARIOS)[number]['id']

export const scenarios: readonly Scenario[] = SCENARIOS

export function scenario(id: string): Scenario {
  const found = scenarios.find((s) => s.id === id)
  if (!found) {
    throw new Error(`Unknown scenario ${id}. There are ${scenarios.map((s) => s.id).join(', ')}.`)
  }
  return found
}

/** Requests that a server has to refuse, if it validates what it says it does. */
export const REJECTED: { name: string; request: Request }[] = [
  ...[
    ['an empty object', {}],
    ['a name that is too long', { name: 'x'.repeat(101), email: 'a@example.com' }],
    ['a number for a name', { name: 1, email: 'a@example.com' }],
    ['an address without a domain', { name: 'a', email: 'a@' }],
    ['a fraction for an age', { name: 'a', email: 'a@example.com', age: 1.5 }],
    ['a negative age', { name: 'a', email: 'a@example.com', age: -1 }],
  ].map(([name, body]) => ({
    name: `POST /users with ${name as string}`,
    request: { method: 'POST' as const, path: '/users', headers: json, body },
  })),
  ...[
    ['no q', ''],
    ['an empty q', 'q='],
    ['a word for a page', 'q=a&page=x'],
    ['page 0', 'q=a&page=0'],
    ['a limit over 100', 'q=a&limit=101'],
    ['an unknown order', 'q=a&sort=sideways'],
  ].map(([name, query]) => ({
    name: `GET /search with ${name}`,
    request: { method: 'GET' as const, path: `/search?${query}` },
  })),
  ...(
    [
      ['no items', { ...order, items: [] }],
      [
        'a bad zip',
        {
          ...order,
          customer: { ...order.customer, address: { ...order.customer.address, zip: '1' } },
        },
      ],
      ['quantity 0', { ...order, items: [{ ...order.items[0], quantity: 0 }] }],
      ['a tag that is a number', { ...order, items: [{ ...order.items[0], tags: [1] }] }],
      ['a string for giftWrap', { ...order, giftWrap: 'yes' }],
    ] as const
  ).map(([name, body]) => ({
    name: `POST /orders with ${name}`,
    request: { method: 'POST' as const, path: '/orders', headers: json, body },
  })),
]

/** Query parameters that are left out get the defaults of the schema. */
export const DEFAULTED = {
  request: { method: 'GET' as const, path: '/search?q=a' },
  expected: { page: 1, limit: 10, sort: 'asc' },
}

/** In full mode the undeclared field must be gone; without it, it is sent. */
export const LEAK = {
  request: { method: 'GET' as const, path: '/leak' },
  leaks: (mode: Mode) => mode === 'request',
}
