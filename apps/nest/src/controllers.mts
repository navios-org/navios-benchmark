import { getLeak, getPing, slowIo } from '@navios-benchmark/shared/data'
import * as schemas from '@navios-benchmark/shared/schemas'
import {
  Controller,
  Get,
  Param,
  SerializeOptions,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'

import type { Me } from '@navios-benchmark/shared/schemas'

import {
  AuthGuard,
  CatalogService,
  Chain1,
  Chain2,
  Chain3,
  CurrentUser,
  RequestAudit,
  UsersService,
} from './services.mjs'

// The controllers without validated input. Those with it are in zod.mts and
// in class-validator.mts.

@Controller()
export class HealthController {
  @Get('ping')
  @SerializeOptions({ schema: schemas.pingResponse })
  ping() {
    return getPing()
  }

  @Get('io')
  @SerializeOptions({ schema: schemas.pingResponse })
  async io() {
    await slowIo()
    return getPing()
  }

  @Get('leak')
  @SerializeOptions({ schema: schemas.leakResponse })
  leak() {
    return getLeak()
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  @SerializeOptions({ schema: schemas.userResponse })
  getUser(@Param('id') id: string) {
    return this.users.get(id)
  }
}

@Controller('catalog')
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get()
  @SerializeOptions({ schema: schemas.catalogResponse })
  list() {
    return this.service.list()
  }
}

@Controller()
export class AccountController {
  @Get('me')
  @UseGuards(AuthGuard)
  @SerializeOptions({ schema: schemas.meResponse })
  me(@CurrentUser() user: Me) {
    return user
  }

  @Get('chain')
  @UseInterceptors(Chain1, Chain2, Chain3)
  @SerializeOptions({ schema: schemas.pingResponse })
  chain() {
    return getPing()
  }
}

// A controller of its own, because a request-scoped dependency makes its
// controller request-scoped too.
@Controller('scoped')
export class ScopedController {
  constructor(private readonly audit: RequestAudit) {}

  @Get()
  @SerializeOptions({ schema: schemas.scopedResponse })
  scoped() {
    return this.audit.record('read')
  }
}
