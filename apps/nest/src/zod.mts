import * as schemas from '@navios-benchmark/shared/schemas'
/** Input validated by the StandardSchemaValidationPipe with the shared schemas. */
import { Body, Controller, Get, Post, Query, SerializeOptions } from '@nestjs/common'

import type {
  CreateUser,
  OrderInput,
  PostsQuery,
  SearchQuery,
} from '@navios-benchmark/shared/schemas'

import { OrdersService, PostsService, SearchService, UsersService } from './services.mjs'

@Controller('users')
export class CreateUserController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @SerializeOptions({ schema: schemas.userResponse })
  create(@Body({ schema: schemas.createUserBody }) body: CreateUser) {
    return this.users.create(body)
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @SerializeOptions({ schema: schemas.searchResponse })
  search(@Query({ schema: schemas.searchQuery }) query: SearchQuery) {
    return this.service.search(query)
  }
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @SerializeOptions({ schema: schemas.orderResponse })
  create(@Body({ schema: schemas.orderBody }) body: OrderInput) {
    return this.orders.create(body)
  }
}

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  @SerializeOptions({ schema: schemas.postsResponse })
  list(@Query({ schema: schemas.postsQuery }) query: PostsQuery) {
    return this.posts.list(query)
  }
}

export const controllers = [
  CreateUserController,
  SearchController,
  OrdersController,
  PostsController,
]
