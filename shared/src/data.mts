/**
 * The work behind the endpoints. It is the same code for every server, it is
 * cheap, and it keeps nothing, so that memory measures the framework.
 */
import type {
  Catalog,
  CreateUser,
  Me,
  Order,
  OrderInput,
  PostsPage,
  SearchQuery,
  SearchResult,
  User,
} from './schemas.mjs'

const TIMESTAMP = '2026-01-15T10:30:00.000Z'

export const TOKEN = 'Bearer benchmark-token'

const users = new Map<string, User>(
  Array.from({ length: 1000 }, (_, i) => {
    const id = String(i + 1)
    return [
      id,
      {
        id,
        name: `User ${id}`,
        email: `user${id}@example.com`,
        role: i % 10 === 0 ? 'admin' : 'member',
        createdAt: TIMESTAMP,
      },
    ]
  }),
)

const posts = Array.from({ length: 200 }, (_, i) => ({
  id: String(i + 1),
  title: `Post ${i + 1}`,
  content: `This is the content of post ${i + 1}. It contains some text for benchmarking.`,
  authorId: String((i % 50) + 1),
}))

const catalog: Catalog = {
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
}

const hits = ['first', 'second', 'third', 'fourth', 'fifth'].map((word, i) => ({
  id: String(i + 1),
  title: `The ${word} result`,
  score: 1 - i / 10,
}))

export function getPing() {
  return { status: 'ok' as const }
}

export function findUser(id: string): User | undefined {
  return users.get(id)
}

let created = 0

export function createUser(input: CreateUser): User {
  created++
  return {
    id: `usr_${created}`,
    name: input.name,
    email: input.email,
    role: 'member',
    createdAt: TIMESTAMP,
  }
}

export function search(query: SearchQuery): SearchResult {
  return {
    query: query.q,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
    total: hits.length,
    results: hits,
  }
}

export function createOrder(input: OrderInput): Order {
  created++
  let total = 0
  let itemCount = 0
  const lines = input.items.map((item) => {
    const amount = item.quantity * item.unitPrice
    total += amount
    itemCount += item.quantity
    return { sku: item.sku, quantity: item.quantity, amount }
  })
  return {
    id: `ord_${created}`,
    customerId: input.customer.id,
    status: 'pending',
    giftWrap: input.giftWrap,
    itemCount,
    total,
    lines,
    createdAt: TIMESTAMP,
  }
}

/** `author` is another service of the application, where there are services. */
export function listPosts(
  page: number,
  pageSize: number,
  author: (id: string) => User | undefined,
): PostsPage {
  const start = (page - 1) * pageSize
  return {
    posts: posts.slice(start, start + pageSize).map((post) => {
      const user = author(post.authorId)!
      return {
        id: post.id,
        title: post.title,
        content: post.content,
        author: { id: user.id, name: user.name },
      }
    }),
    total: posts.length,
    page,
    pageSize,
  }
}

export function getCatalog(): Catalog {
  return catalog
}

export function authenticate(authorization: string | null | undefined): Me | null {
  return authorization === TOKEN ? { id: '7', name: 'Ada', roles: ['admin', 'editor'] } : null
}

export function getLeak() {
  return { id: '1', secret: 'must not leave the server when responses are validated' }
}

export function slowIo(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

/** The collaborators of the request-scoped scenario. */
export class Counter {
  private value = 0
  next() {
    return ++this.value
  }
}

/** What a container builds for each request, built by hand. */
class RequestId {
  readonly value: number
  constructor(counter: Counter) {
    this.value = counter.next()
  }
}
class RequestAudit {
  private readonly entries: string[] = []
  constructor(private readonly id: RequestId) {}
  record(entry: string) {
    this.entries.push(entry)
    return { requests: this.id.value, entries: this.entries.length }
  }
}
export function openAudit(counter: Counter) {
  return new RequestAudit(new RequestId(counter))
}

/** The error body of the servers that bring no format of their own. */
export function problem(status: number, title: string, errors?: unknown) {
  return errors ? { status, title, errors } : { status, title }
}
