/**
 * The contract every server implements. All of them validate with these same
 * schema objects, so that no framework is measured with a cheaper validator
 * than another unless the variant says so.
 */
import { z } from 'zod'

export const pingResponse = z.object({ status: z.literal('ok') })

export const userResponse = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: z.enum(['admin', 'member']),
  createdAt: z.string(),
})

export const createUserBody = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  age: z.number().int().min(0).max(150).optional(),
})

export const searchQuery = z.object({
  q: z.string().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sort: z.enum(['asc', 'desc']).default('asc'),
})

export const searchResponse = z.object({
  query: z.string(),
  page: z.number(),
  limit: z.number(),
  sort: z.enum(['asc', 'desc']),
  total: z.number(),
  results: z.array(z.object({ id: z.string(), title: z.string(), score: z.number() })),
})

export const orderBody = z.object({
  customer: z.object({
    id: z.string().min(1),
    email: z.email(),
    address: z.object({
      street: z.string().min(1),
      city: z.string().min(1),
      zip: z.string().regex(/^\d{5}$/),
      country: z.string().length(2),
    }),
  }),
  items: z
    .array(
      z.object({
        sku: z.string().min(1).max(40),
        quantity: z.number().int().min(1).max(1000),
        unitPrice: z.number().min(0),
        tags: z.array(z.string()).max(10),
      }),
    )
    .min(1)
    .max(100),
  coupon: z.string().optional(),
  giftWrap: z.boolean().default(false),
})

export const orderResponse = z.object({
  id: z.string(),
  customerId: z.string(),
  status: z.enum(['pending', 'paid']),
  giftWrap: z.boolean(),
  itemCount: z.number(),
  total: z.number(),
  lines: z.array(z.object({ sku: z.string(), quantity: z.number(), amount: z.number() })),
  createdAt: z.string(),
})

export const postsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
})

export const postsResponse = z.object({
  posts: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
      author: z.object({ id: z.string(), name: z.string() }),
    }),
  ),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export const catalogResponse = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      description: z.string(),
      price: z.number(),
      metadata: z.object({
        createdAt: z.string(),
        updatedAt: z.string(),
        tags: z.array(z.string()),
        score: z.number(),
      }),
    }),
  ),
})

export const meResponse = z.object({
  id: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
})

export const scopedResponse = z.object({ requests: z.number(), entries: z.number() })

/** Only for the conformance test: does the response schema do its work? */
export const leakResponse = z.object({ id: z.string() })

export type User = z.output<typeof userResponse>
export type CreateUser = z.output<typeof createUserBody>
export type SearchQuery = z.output<typeof searchQuery>
export type SearchResult = z.output<typeof searchResponse>
export type OrderInput = z.output<typeof orderBody>
export type Order = z.output<typeof orderResponse>
export type PostsQuery = z.output<typeof postsQuery>
export type PostsPage = z.output<typeof postsResponse>
export type Catalog = z.output<typeof catalogResponse>
export type Me = z.output<typeof meResponse>
