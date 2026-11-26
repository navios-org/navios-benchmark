import { Module } from '@navios/server'

import {
  AccountController,
  CatalogController,
  HealthController,
  OrdersController,
  PostsController,
  SearchController,
  UsersController,
} from './controllers.mjs'

@Module({ controllers: [UsersController, AccountController] })
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
