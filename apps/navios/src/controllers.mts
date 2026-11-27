import { getLeak, getPing, slowIo } from '@navios-benchmark/shared/data'
import { Controller, Endpoint, inject, reply, UseGuards, UseInterceptors } from '@navios/server'

import type { HandlerParams, RequestContext } from '@navios/server'

import * as api from './api.mjs'
import {
  AuthGuard,
  CatalogService,
  Chain1,
  Chain2,
  Chain3,
  CurrentUser,
  OrdersService,
  PostsService,
  RequestAudit,
  SearchService,
  UsersService,
} from './services.mjs'

@Controller()
export class HealthController {
  @Endpoint(api.ping)
  ping() {
    return getPing()
  }

  @Endpoint(api.io)
  async io() {
    await slowIo()
    return getPing()
  }

  @Endpoint(api.leak)
  leak() {
    return getLeak()
  }
}

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(api.getUser)
  getUser({ urlParams }: HandlerParams<typeof api.getUser>) {
    return this.users.get(urlParams.id)
  }

  @Endpoint(api.createUser)
  createUser({ data }: HandlerParams<typeof api.createUser>) {
    return reply(201, this.users.create(data))
  }
}

@Controller()
export class SearchController {
  private readonly service = inject(SearchService)

  @Endpoint(api.search)
  search({ params }: HandlerParams<typeof api.search>) {
    return this.service.search(params)
  }
}

@Controller()
export class OrdersController {
  private readonly orders = inject(OrdersService)

  @Endpoint(api.createOrder)
  create({ data }: HandlerParams<typeof api.createOrder>) {
    return reply(201, this.orders.create(data))
  }
}

@Controller()
export class PostsController {
  private readonly posts = inject(PostsService)

  @Endpoint(api.listPosts)
  list({ params }: HandlerParams<typeof api.listPosts>) {
    return this.posts.list(params)
  }
}

@Controller()
export class CatalogController {
  private readonly service = inject(CatalogService)

  @Endpoint(api.catalog)
  list() {
    return this.service.list()
  }
}

@Controller()
export class AccountController {
  @UseGuards(AuthGuard)
  @Endpoint(api.me)
  me(_params: HandlerParams<typeof api.me>, ctx: RequestContext) {
    return ctx.get(CurrentUser)
  }

  @UseInterceptors(Chain1, Chain2, Chain3)
  @Endpoint(api.chain)
  chain() {
    return getPing()
  }

  @Endpoint(api.scoped)
  scoped(_params: HandlerParams<typeof api.scoped>, ctx: RequestContext) {
    return ctx.use(RequestAudit).record('read')
  }
}
