import { getLeak, getPing, slowIo } from '@navios-benchmark/shared/data'
import { Controller, Endpoint, HttpCode, Request, UseGuards } from '@navios/core'
import { inject } from '@navios/di'

import type { Me } from '@navios-benchmark/shared/schemas'
import type { EndpointParams } from '@navios/core'

import * as api from './api.mjs'
import {
  AuthGuard,
  CatalogService,
  OrdersService,
  PostsService,
  RequestAudit,
  SearchService,
  UsersService,
} from './services.mjs'

@Controller()
export class HealthController {
  @Endpoint(api.ping)
  async ping() {
    return getPing()
  }

  @Endpoint(api.io)
  async io() {
    await slowIo()
    return getPing()
  }

  @Endpoint(api.leak)
  async leak() {
    return getLeak()
  }
}

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(api.getUser)
  async getUser({ urlParams }: EndpointParams<typeof api.getUser>) {
    return this.users.get(urlParams.id)
  }

  @Endpoint(api.createUser)
  @HttpCode(201)
  async createUser({ data }: EndpointParams<typeof api.createUser>) {
    return this.users.create(data)
  }
}

@Controller()
export class SearchController {
  private readonly service = inject(SearchService)

  @Endpoint(api.search)
  async search({ params }: EndpointParams<typeof api.search>) {
    return this.service.search(params)
  }
}

@Controller()
export class OrdersController {
  private readonly orders = inject(OrdersService)

  @Endpoint(api.createOrder)
  @HttpCode(201)
  async create({ data }: EndpointParams<typeof api.createOrder>) {
    return this.orders.create(data)
  }
}

@Controller()
export class PostsController {
  private readonly posts = inject(PostsService)

  @Endpoint(api.listPosts)
  async list({ params }: EndpointParams<typeof api.listPosts>) {
    return this.posts.list(params)
  }
}

@Controller()
export class CatalogController {
  private readonly service = inject(CatalogService)

  @Endpoint(api.catalog)
  async list() {
    return this.service.list()
  }
}

@UseGuards(AuthGuard)
@Controller()
export class MeController {
  private readonly request = inject(Request) as unknown as { user: Me }

  @Endpoint(api.me)
  async me() {
    return this.request.user
  }
}

@Controller()
export class ScopedController {
  private readonly audit = inject(RequestAudit)

  @Endpoint(api.scoped)
  async scoped() {
    return this.audit.record('read')
  }
}
