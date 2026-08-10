import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { NestAppLogger } from '../common/logging/app-logger';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheStore } from '../infrastructure/redis/redis.store';

@Injectable()
export class RuntimeLifecycleService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new NestAppLogger();
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisCacheStore,
  ) {}

  onModuleInit() {
    void this.connectInBackground('postgres', () => this.prisma.connect());
    void this.connectInBackground('redis', () => this.redis.connect());
  }

  async onApplicationShutdown() {
    this.stopping = true;
    await this.redis.quit();
    await this.prisma.disconnect();
  }

  private async connectInBackground(
    dependency: 'postgres' | 'redis',
    connect: () => Promise<void>,
  ) {
    const enabled =
      dependency === 'postgres'
        ? this.prisma.isEnabled()
        : this.redis.isEnabled();
    if (!enabled) {
      return;
    }

    for (let attempt = 0; attempt < 3 && !this.stopping; attempt += 1) {
      try {
        await connect();
        this.logger.info('runtime.dependency.connected', {
          timestamp: new Date().toISOString(),
          service: 'slice-api',
          environment: process.env.NODE_ENV ?? 'development',
          dependency,
          attempt: attempt + 1,
        });
        return;
      } catch {
        this.logger.warn('runtime.dependency.unavailable', {
          timestamp: new Date().toISOString(),
          service: 'slice-api',
          environment: process.env.NODE_ENV ?? 'development',
          dependency,
          attempt: attempt + 1,
        });
        await delay(100 * 2 ** attempt + Math.floor(Math.random() * 50));
      }
    }
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
