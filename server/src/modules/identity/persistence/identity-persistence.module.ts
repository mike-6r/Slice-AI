import { Module } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  createIdentityTransaction,
  PrismaIdentityUnitOfWork,
} from './prisma-identity.repositories';
import {
  ACCOUNT_STATUS_HISTORY_REPOSITORY,
  AUDIT_EVENT_REPOSITORY,
  IDEMPOTENCY_REPOSITORY,
  CONSENT_ACCEPTANCE_REPOSITORY,
  IDENTITY_UNIT_OF_WORK,
  ROLE_ASSIGNMENT_REPOSITORY,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
} from '../ports/repositories';

@Module({
  providers: [
    PrismaIdentityUnitOfWork,
    { provide: IDENTITY_UNIT_OF_WORK, useExisting: PrismaIdentityUnitOfWork },
    {
      provide: USER_REPOSITORY,
      useFactory: (db: PrismaService) => createIdentityTransaction(db).users,
      inject: [PrismaService],
    },
    {
      provide: SESSION_REPOSITORY,
      useFactory: (db: PrismaService) => createIdentityTransaction(db).sessions,
      inject: [PrismaService],
    },
    {
      provide: ROLE_ASSIGNMENT_REPOSITORY,
      useFactory: (db: PrismaService) => createIdentityTransaction(db).roles,
      inject: [PrismaService],
    },
    {
      provide: ACCOUNT_STATUS_HISTORY_REPOSITORY,
      useFactory: (db: PrismaService) =>
        createIdentityTransaction(db).statusHistory,
      inject: [PrismaService],
    },
    {
      provide: AUDIT_EVENT_REPOSITORY,
      useFactory: (db: PrismaService) => createIdentityTransaction(db).audit,
      inject: [PrismaService],
    },
    {
      provide: IDEMPOTENCY_REPOSITORY,
      useFactory: (db: PrismaService) =>
        createIdentityTransaction(db).idempotency,
      inject: [PrismaService],
    },
    {
      provide: CONSENT_ACCEPTANCE_REPOSITORY,
      useFactory: (db: PrismaService) =>
        createIdentityTransaction(db).consents,
      inject: [PrismaService],
    },
  ],
  exports: [
    IDENTITY_UNIT_OF_WORK,
    USER_REPOSITORY,
    SESSION_REPOSITORY,
    ROLE_ASSIGNMENT_REPOSITORY,
    ACCOUNT_STATUS_HISTORY_REPOSITORY,
    AUDIT_EVENT_REPOSITORY,
    IDEMPOTENCY_REPOSITORY,
    CONSENT_ACCEPTANCE_REPOSITORY,
  ],
})
export class IdentityPersistenceModule {}
