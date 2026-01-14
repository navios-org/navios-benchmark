import type { EndpointParams, EndpointResult } from '@navios/core'

import { Controller, Endpoint } from '@navios/core/legacy-compat'
import { inject } from '@navios/di'

import { postsEndpoint } from '../api.mjs'
import { PostsService } from './posts.service.mjs'

@Controller()
export class PostsController {
  private readonly postsService = inject(PostsService)

  @Endpoint(postsEndpoint)
  async getPosts(params: EndpointParams<typeof postsEndpoint>): EndpointResult<typeof postsEndpoint> {
    const { page, pageSize } = params.params
    return this.postsService.getAll(page, pageSize)
  }
}
