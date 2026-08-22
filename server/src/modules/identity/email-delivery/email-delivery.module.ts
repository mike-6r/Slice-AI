import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import {
  LocalTestTransactionalEmailProvider,
  ResendTransactionalEmailProvider,
  TRANSACTIONAL_EMAIL_PROVIDER,
  TransactionalEmailService,
} from './transactional-email.service';

@Module({
  providers: [
    TransactionalEmailService,
    LocalTestTransactionalEmailProvider,
    ResendTransactionalEmailProvider,
    {
      provide: TRANSACTIONAL_EMAIL_PROVIDER,
      inject: [APP_CONFIG, LocalTestTransactionalEmailProvider, ResendTransactionalEmailProvider],
      useFactory: (
        config: AppConfig,
        local: LocalTestTransactionalEmailProvider,
        resend: ResendTransactionalEmailProvider,
      ) => (config.emailDeliveryMode === 'local_test' ? local : resend),
    },
  ],
  exports: [TransactionalEmailService, LocalTestTransactionalEmailProvider, TRANSACTIONAL_EMAIL_PROVIDER],
})
export class EmailDeliveryModule {}
