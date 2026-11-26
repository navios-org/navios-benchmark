import * as data from '@navios-benchmark/shared/data'
import { NotFoundException } from '@navios/core'
import { Injectable, InjectableScope, inject } from '@navios/di'

import type {
  CreateUser,
  OrderInput,
  PostsQuery,
  SearchQuery,
} from '@navios-benchmark/shared/schemas'
import type { AbstractExecutionContext, CanActivate } from '@navios/core'
import type { OnServiceInit } from '@navios/di'

@Injectable()
export class UsersService {
  find(id: string) {
    return data.findUser(id)
  }
  get(id: string) {
    const user = data.findUser(id)
    if (!user) {
      throw new NotFoundException({ message: 'User not found' })
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

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: AbstractExecutionContext) {
    const request = context.getRequest()
    // A web Request on Bun, a FastifyRequest on Node.js.
    const headers = request.headers as Headers | Record<string, string>
    const authorization =
      headers instanceof Headers ? headers.get('authorization') : headers.authorization
    const user = data.authenticate(authorization)
    if (!user) {
      return false
    }
    request.user = user
    return true
  }
}

@Injectable()
export class RequestCounter extends data.Counter {}

@Injectable({ scope: InjectableScope.Request })
export class RequestId implements OnServiceInit {
  private readonly counter = inject(RequestCounter)
  value = 0

  // In 1.x a dependency cannot be used before the instance is initialised.
  onServiceInit() {
    this.value = this.counter.next()
  }
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
