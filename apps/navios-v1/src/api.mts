import * as schemas from '@navios-benchmark/shared/schemas'
import { builder } from '@navios/builder'

const API = builder()

export const ping = API.declareEndpoint({
  method: 'GET',
  url: '/ping',
  responseSchema: schemas.pingResponse,
})
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: schemas.userResponse,
})
export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: schemas.createUserBody,
  responseSchema: schemas.userResponse,
})
export const search = API.declareEndpoint({
  method: 'GET',
  url: '/search',
  querySchema: schemas.searchQuery,
  responseSchema: schemas.searchResponse,
})
export const createOrder = API.declareEndpoint({
  method: 'POST',
  url: '/orders',
  requestSchema: schemas.orderBody,
  responseSchema: schemas.orderResponse,
})
export const listPosts = API.declareEndpoint({
  method: 'GET',
  url: '/posts',
  querySchema: schemas.postsQuery,
  responseSchema: schemas.postsResponse,
})
export const catalog = API.declareEndpoint({
  method: 'GET',
  url: '/catalog',
  responseSchema: schemas.catalogResponse,
})
export const me = API.declareEndpoint({
  method: 'GET',
  url: '/me',
  responseSchema: schemas.meResponse,
})
export const scoped = API.declareEndpoint({
  method: 'GET',
  url: '/scoped',
  responseSchema: schemas.scopedResponse,
})
export const io = API.declareEndpoint({
  method: 'GET',
  url: '/io',
  responseSchema: schemas.pingResponse,
})
export const leak = API.declareEndpoint({
  method: 'GET',
  url: '/leak',
  responseSchema: schemas.leakResponse,
})
