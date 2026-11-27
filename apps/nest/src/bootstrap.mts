import 'reflect-metadata'
import { host, port, validateResponses } from '@navios-benchmark/shared/host'
import {
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  ValidationPipe,
} from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'

import type { AbstractHttpAdapter } from '@nestjs/core'

import { createAppModule } from './app.module.mjs'

export async function bootstrap(adapter: AbstractHttpAdapter) {
  const classes = process.env.NEST_VALIDATOR === 'class'
  const { controllers } = classes
    ? await import('./class-validator.mjs')
    : await import('./zod.mjs')
  const app = await NestFactory.create(createAppModule(controllers), adapter, { logger: false })
  app.useGlobalPipes(
    classes
      ? new ValidationPipe({ transform: true, whitelist: true })
      : new StandardSchemaValidationPipe(),
  )
  if (validateResponses) {
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)))
  }
  await app.listen(port, host)
}
