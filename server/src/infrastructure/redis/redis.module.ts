import { Global, Module } from '@nestjs/common';
import { CACHE_STORE, RedisCacheStore } from './redis.store';

@Global()
@Module({
  providers: [
    RedisCacheStore,
    { provide: CACHE_STORE, useExisting: RedisCacheStore },
  ],
  exports: [RedisCacheStore, CACHE_STORE],
})
export class RedisModule {}
