import { Controller, Endpoint, EndpointParams, EndpointResult } from '@navios/core/legacy-compat'

import { getHealthResponse, getJsonResponse } from '../../../../shared/data.js'
import { healthEndpoint, jsonEndpoint } from '../api.mjs'

@Controller()
export class HealthController {
  @Endpoint(healthEndpoint)
  async health(_params: EndpointParams<typeof healthEndpoint>): EndpointResult<typeof healthEndpoint> {
    return getHealthResponse()
  }

  @Endpoint(jsonEndpoint)
  async json(_params: EndpointParams<typeof jsonEndpoint>): EndpointResult<typeof jsonEndpoint> {
    return getJsonResponse()
  }
}
