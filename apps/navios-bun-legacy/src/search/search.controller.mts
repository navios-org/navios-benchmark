import type { EndpointParams, EndpointResult } from '@navios/core'
import { Controller, Endpoint } from '@navios/core/legacy-compat'
import { searchEndpoint } from '../api.mjs'
import { getSearchResults } from '../../../../shared/data.js'

@Controller()
export class SearchController {
  @Endpoint(searchEndpoint)
  async search(params: EndpointParams<typeof searchEndpoint>): EndpointResult<typeof searchEndpoint> {
    const { q, page, limit } = params.params
    return getSearchResults(q, page, limit)
  }
}
