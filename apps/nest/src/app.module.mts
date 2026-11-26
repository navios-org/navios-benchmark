import { Module } from '@nestjs/common'

import type { Type } from '@nestjs/common'

import {
  AccountController,
  CatalogController,
  HealthController,
  ScopedController,
  UsersController,
} from './controllers.mjs'
import {
  CatalogService,
  OrdersService,
  PostsService,
  RequestAudit,
  RequestCounter,
  RequestId,
  SearchService,
  UsersService,
} from './services.mjs'

/** `validated` are the controllers with validated input, in the order of zod.mts. */
export function createAppModule(validated: Type[]): Type {
  const [createUser, search, orders, posts] = validated as [Type, Type, Type, Type]

  @Module({
    controllers: [UsersController, createUser, AccountController, ScopedController],
    providers: [UsersService, RequestCounter, RequestId, RequestAudit],
    exports: [UsersService],
  })
  class UsersModule {}

  @Module({
    imports: [UsersModule],
    controllers: [posts, search],
    providers: [PostsService, SearchService],
  })
  class ContentModule {}

  @Module({
    controllers: [orders, CatalogController],
    providers: [OrdersService, CatalogService],
  })
  class ShopModule {}

  @Module({
    imports: [UsersModule, ContentModule, ShopModule],
    controllers: [HealthController],
  })
  class AppModule {}

  return AppModule
}
