import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheStore } from '../infrastructure/redis/redis.store';

type ReadinessCheck = { status: 'up'; latencyMs: number } | { status: 'down' };

export type RuntimeReadiness = {
  status: 'ready' | 'not_ready';
  checks: { postgres: ReadinessCheck; redis: ReadinessCheck };
  timestamp: string;
};

@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisCacheStore,
  ) {}

  async check(): Promise<RuntimeReadiness> {
    const [postgres, redis] = await Promise.all([
      this.checkDependency(() => this.prisma.check()),
      this.checkDependency(() => this.redis.ping()),
    ]);
    return {
      status:
        postgres.status === 'up' && redis.status === 'up'
          ? 'ready'
          : 'not_ready',
      checks: { postgres, redis },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDependency(
    check: () => Promise<{ status: 'up'; latencyMs: number }>,
  ): Promise<ReadinessCheck> {
    try {
      return await check();
    } catch {
      return { status: 'down' };
    }
  }
}
