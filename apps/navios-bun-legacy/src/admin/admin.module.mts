import { Module } from '@navios/core/legacy-compat'
import { AdminController } from './admin.controller.mjs'

@Module({
  controllers: [AdminController],
})
export class AdminModule {}
