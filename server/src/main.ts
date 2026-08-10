import { Logger } from '@nestjs/common';
import { createApp } from './create-app';
import { APP_CONFIG, type AppConfig } from './config/app-config';

async function bootstrap() {
  const app = await createApp();
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port, config.host);
  Logger.log(
    `Slice API listening on http://${config.host}:${config.port}/api/v1`,
    'Bootstrap',
  );
}

void bootstrap();
