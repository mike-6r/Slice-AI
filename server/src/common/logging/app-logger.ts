import { Logger } from '@nestjs/common';
import { redact } from './redaction';

export type LogLevel = 'info' | 'warn' | 'error';

export interface AppLogger {
  info(event: string, fields: Record<string, unknown>): void;
  warn(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
}

export class NestAppLogger implements AppLogger {
  private readonly logger = new Logger('SliceApi');

  info(event: string, fields: Record<string, unknown>) {
    this.write('info', event, fields);
  }

  warn(event: string, fields: Record<string, unknown>) {
    this.write('warn', event, fields);
  }

  error(event: string, fields: Record<string, unknown>) {
    this.write('error', event, fields);
  }

  private write(
    level: LogLevel,
    event: string,
    fields: Record<string, unknown>,
  ) {
    const message = JSON.stringify(redact({ event, level, ...fields }));
    if (level === 'error') {
      this.logger.error(message);
    } else if (level === 'warn') {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }
  }
}
