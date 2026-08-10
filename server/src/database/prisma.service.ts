import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

export type DependencyHealth = { status: 'up'; latencyMs: number };

@Injectable()
export class PrismaService extends PrismaClient {
  private readonly enabled: boolean;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super(
      config.databaseUrl
        ? { datasources: { db: { url: config.databaseUrl } } }
        : undefined,
    );
    this.enabled = Boolean(config.databaseUrl);
  }

  isEnabled() {
    return this.enabled;
  }

  async connect() {
    this.assertEnabled();
    await withTimeout(this.$connect(), this.config.dbConnectTimeoutMs);
  }

  async disconnect() {
    if (this.enabled) {
      await this.$disconnect();
    }
  }

  async check(
    timeoutMs = this.config.dbConnectTimeoutMs,
  ): Promise<DependencyHealth> {
    this.assertEnabled();
    const start = performance.now();
    await withTimeout(this.$queryRaw`SELECT 1`, timeoutMs);
    return { status: 'up', latencyMs: Math.round(performance.now() - start) };
  }

  async withTransaction<T>(
    callback: (client: Prisma.TransactionClient) => Promise<T>,
  ) {
    this.assertEnabled();
    return this.$transaction((client) => callback(client));
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new Error('Database runtime is not configured.');
    }
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Dependency operation timed out.')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
