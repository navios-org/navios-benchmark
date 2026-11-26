import * as data from '@navios-benchmark/shared/data'
import {
  createContextKey,
  inject,
  Injectable,
  InjectableScope,
  NotFoundException,
} from '@navios/server'

import type {
  CreateUser,
  Me,
  OrderInput,
  PostsQuery,
  SearchQuery,
} from '@navios-benchmark/shared/schemas'
import type { Guard, Interceptor, RequestContext, RouteResult } from '@navios/server'

@Injectable()
export class UsersService {
  find(id: string) {
    return data.findUser(id)
  }
  get(id: string) {
    const user = data.findUser(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }
  create(input: CreateUser) {
    return data.createUser(input)
  }
}

@Injectable()
export class SearchService {
  search(query: SearchQuery) {
    return data.search(query)
  }
}

@Injectable()
export class OrdersService {
  create(input: OrderInput) {
    return data.createOrder(input)
  }
}

@Injectable()
export class PostsService {
  private readonly users = inject(UsersService)

  list({ page, pageSize }: PostsQuery) {
    return data.listPosts(page, pageSize, (id) => this.users.find(id))
  }
}

@Injectable()
export class CatalogService {
  list() {
    return data.getCatalog()
  }
}

export const CurrentUser = createContextKey<Me>('CurrentUser')

@Injectable()
export class AuthGuard implements Guard {
  canActivate(ctx: RequestContext) {
    const user = data.authenticate(ctx.headers.get('authorization'))
    if (!user) {
      return false
    }
    ctx.set(CurrentUser, user)
    return true
  }
}

abstract class ChainInterceptor implements Interceptor {
  protected abstract readonly header: string

  async intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
    const result = await next()
    ctx.reply.header(this.header, '1')
    return result
  }
}

@Injectable()
export class Chain1 extends ChainInterceptor {
  protected readonly header = 'x-chain-1'
}
@Injectable()
export class Chain2 extends ChainInterceptor {
  protected readonly header = 'x-chain-2'
}
@Injectable()
export class Chain3 extends ChainInterceptor {
  protected readonly header = 'x-chain-3'
}

@Injectable()
export class RequestCounter extends data.Counter {}

@Injectable({ scope: InjectableScope.Request })
export class RequestId {
  private readonly counter = inject(RequestCounter)
  readonly value = this.counter.next()
}

@Injectable({ scope: InjectableScope.Request })
export class RequestAudit {
  private readonly id = inject(RequestId)
  private readonly entries: string[] = []

  record(entry: string) {
    this.entries.push(entry)
    return { requests: this.id.value, entries: this.entries.length }
  }
}
