import { Module } from '@navios/core'

import {
  CatalogController,
  HealthController,
  MeController,
  OrdersController,
  PostsController,
  ScopedController,
  SearchController,
  UsersController,
} from './controllers.mjs'

@Module({ controllers: [UsersController, MeController, ScopedController] })
class UsersModule {}

@Module({ controllers: [PostsController, SearchController] })
class ContentModule {}

@Module({ controllers: [OrdersController, CatalogController] })
class ShopModule {}

@Module({
  imports: [UsersModule, ContentModule, ShopModule],
  controllers: [HealthController],
})
export class AppModule {}
