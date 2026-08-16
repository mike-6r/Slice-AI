import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ConfigModule } from '../../config/config.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { OwnershipModule } from '../ownership/ownership.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [DatabaseModule, AuthModule, AccessControlModule, ConfigModule, SubmissionsModule, OwnershipModule, MarketModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
