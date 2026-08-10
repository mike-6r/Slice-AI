import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { CatalogueService } from './application/catalogue.service';
import { CatalogueController } from './http/catalogue.controller';
import { CataloguePersistenceModule } from './persistence/catalogue-persistence.module';
@Module({
  imports: [AuthModule, AccessControlModule, CataloguePersistenceModule],
  controllers: [CatalogueController],
  providers: [CatalogueService],
})
export class CatalogueModule {}
