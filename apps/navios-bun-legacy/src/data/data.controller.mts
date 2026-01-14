import { Controller, Endpoint, EndpointParams, EndpointResult } from '@navios/core/legacy-compat'

import { getLargeData } from '../../../../shared/data.js'
import { largeDataEndpoint } from '../api.mjs'

@Controller()
export class DataController {
  @Endpoint(largeDataEndpoint)
  async getLargeData(_params: EndpointParams<typeof largeDataEndpoint>): EndpointResult<typeof largeDataEndpoint> {
    return getLargeData()
  }
}
