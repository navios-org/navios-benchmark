import { Controller, Endpoint, EndpointParams, EndpointResult, UseGuards } from '@navios/core/legacy-compat'
import { inject } from '@navios/di'

import { statsEndpoint } from '../api.mjs'
import { AdminGuard } from './admin.guard.mjs'
import { StatsService } from './stats.service.mjs'

@UseGuards(AdminGuard)
@Controller()
export class AdminController {
  private readonly statsService = inject(StatsService)

  @Endpoint(statsEndpoint)
  async getStats(_params: EndpointParams<typeof statsEndpoint>): EndpointResult<typeof statsEndpoint> {
    return this.statsService.getStats()
  }
}
