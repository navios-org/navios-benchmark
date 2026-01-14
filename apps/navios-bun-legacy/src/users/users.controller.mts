import type { EndpointParams, EndpointResult } from '@navios/core'

import { Controller, Endpoint, HttpCode } from '@navios/core/legacy-compat'
import { inject } from '@navios/di'

import { createUserEndpoint, getUserEndpoint } from '../api.mjs'
import { UsersService } from './users.service.mjs'

@Controller()
export class UsersController {
  private readonly usersService = inject(UsersService)

  @Endpoint(getUserEndpoint)
  async getUser(params: EndpointParams<typeof getUserEndpoint>): EndpointResult<typeof getUserEndpoint> {
    return this.usersService.getById(params.urlParams.userId)
  }

  @Endpoint(createUserEndpoint)
  @HttpCode(201)
  async createUser(params: EndpointParams<typeof createUserEndpoint>): EndpointResult<typeof createUserEndpoint> {
    return this.usersService.create(params.data)
  }
}
