import {
  Logger,
  ValidationPipe,
  type INestApplication,
  type Type,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/http/global-http-exception.filter';
import { requestIdMiddleware } from './common/http/request-id.middleware';
import { createRequestLogMiddleware } from './common/http/request-log.middleware';
import { createOperationalControlsMiddleware } from './common/http/operational-controls.middleware';
import { validationExceptionFactory } from './common/http/validation-exception.factory';
import { NestAppLogger } from './common/logging/app-logger';
import { APP_CONFIG, type AppConfig } from './config/app-config';

export async function createApp(
  rootModule: Type<unknown> = AppModule,
): Promise<INestApplication<unknown>> {
  const app = await NestFactory.create(rootModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = app.get<AppConfig>(APP_CONFIG);

  app.useLogger(new Logger('SliceApi'));
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  app.use(
    requestIdMiddleware,
    createRequestLogMiddleware(new NestAppLogger(), {
      service: 'slice-api',
      environment: config.environment,
    }),
  );
  app.use(createOperationalControlsMiddleware(config));
  app.use(
    json({
      limit: config.bodyLimit,
      verify: (request, _response, body) => {
        (request as typeof request & { rawBody?: Buffer }).rawBody =
          Buffer.from(body);
      },
    }),
  );
  app.use(urlencoded({ extended: false, limit: config.bodyLimit }));
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  return app as INestApplication<unknown>;
}
