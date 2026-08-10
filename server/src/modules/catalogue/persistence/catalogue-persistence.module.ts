import { Module } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CATALOGUE_REPOSITORY } from '../ports/catalogue.repositories';
import { PrismaCatalogueRepository } from './prisma-catalogue.repository';
@Module({
  providers: [
    {
      provide: CATALOGUE_REPOSITORY,
      useFactory: (db: PrismaService) => new PrismaCatalogueRepository(db),
      inject: [PrismaService],
    },
  ],
  exports: [CATALOGUE_REPOSITORY],
})
export class CataloguePersistenceModule {}
