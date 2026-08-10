import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { ReadsController } from './reads.controller';
@Module({ imports: [AuthModule], controllers: [ReadsController] })
export class ReadsModule {}
