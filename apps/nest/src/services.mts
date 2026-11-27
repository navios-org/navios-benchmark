import * as data from '@navios-benchmark/shared/data'
import {
  type CallHandler,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  NotFoundException,
  Scope,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { tap } from 'rxjs'

import type {
  CreateUser,
  Me,
  OrderInput,
  PostsQuery,
  SearchQuery,
} from '@navios-benchmark/shared/schemas'

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
  constructor(private readonly users: UsersService) {}

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

type AuthenticatedRequest = { headers: { authorization?: string }; user?: Me }

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = data.authenticate(request.headers.authorization)
    if (!user) {
      return false
    }
    request.user = user
    return true
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
)

abstract class ChainInterceptor implements NestInterceptor {
  protected abstract readonly header: string

  constructor(protected readonly host: HttpAdapterHost) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse()
    return next
      .handle()
      .pipe(tap(() => this.host.httpAdapter.setHeader(response, this.header, '1')))
  }
}

@Injectable()
export class Chain1 extends ChainInterceptor {
  protected readonly header = 'x-chain-1'
  // Its own constructor, so that the decorator metadata names what to inject.
  // oxlint-disable-next-line no-useless-constructor
  constructor(host: HttpAdapterHost) {
    super(host)
  }
}
@Injectable()
export class Chain2 extends ChainInterceptor {
  protected readonly header = 'x-chain-2'
  // Its own constructor, so that the decorator metadata names what to inject.
  // oxlint-disable-next-line no-useless-constructor
  constructor(host: HttpAdapterHost) {
    super(host)
  }
}
@Injectable()
export class Chain3 extends ChainInterceptor {
  protected readonly header = 'x-chain-3'
  // Its own constructor, so that the decorator metadata names what to inject.
  // oxlint-disable-next-line no-useless-constructor
  constructor(host: HttpAdapterHost) {
    super(host)
  }
}

@Injectable()
export class RequestCounter extends data.Counter {}

@Injectable({ scope: Scope.REQUEST })
export class RequestId {
  readonly value: number
  constructor(counter: RequestCounter) {
    this.value = counter.next()
  }
}

@Injectable({ scope: Scope.REQUEST })
export class RequestAudit {
  private readonly entries: string[] = []
  constructor(private readonly id: RequestId) {}

  record(entry: string) {
    this.entries.push(entry)
    return { requests: this.id.value, entries: this.entries.length }
  }
}
