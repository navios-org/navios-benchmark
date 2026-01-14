import { Injectable } from '@navios/core/legacy-compat'
import { getStats } from '../../../../shared/data.js'
import type { StatsResponse } from '../../../../shared/schemas.js'

@Injectable()
export class StatsService {
  getStats(): StatsResponse {
    return getStats()
  }
}
