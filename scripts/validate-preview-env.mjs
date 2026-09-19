#!/usr/bin/env node

/**
 * Reject a preview environment that could overlap staging state. This script
 * intentionally reports configuration keys only—never environment values.
 */
const env = process.env;
const failures = [];

const requireExact = (key, expected) => {
  if (env[key] !== expected) failures.push(`${key} must be ${expected}.`);
};

const requireUrl = (key, allowedProtocols = ['http:', 'https:']) => {
  const value = env[key]?.trim();
  if (!value) {
    failures.push(`${key} is required.`);
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (!allowedProtocols.includes(parsed.protocol) || parsed.search || parsed.hash) {
      throw new Error('wrong URL protocol');
    }
    return parsed;
  } catch {
    failures.push(`${key} must be a clean URL with the expected protocol.`);
    return undefined;
  }
};

const requirePostgresPreviewDatabase = () => {
  const databaseUrl = requireUrl('DATABASE_URL', ['postgres:', 'postgresql:']);
  if (!databaseUrl) return;
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    failures.push('DATABASE_URL must use PostgreSQL.');
    return;
  }
  const database = databaseUrl.pathname.replace(/^\//, '');
  if (!/^[a-z0-9_]+_preview$/i.test(database)) {
    failures.push('DATABASE_URL must target a dedicated *_preview database.');
  }
};

const requirePreviewRedis = () => {
  const redisUrl = requireUrl('REDIS_URL', ['redis:', 'rediss:']);
  if (!redisUrl) return;
  if (!['redis:', 'rediss:'].includes(redisUrl.protocol)) {
    failures.push('REDIS_URL must use Redis.');
    return;
  }
  if (!/^\/[1-9]\d*$/.test(redisUrl.pathname)) {
    failures.push('REDIS_URL must use a non-default Redis database.');
  }
};

requireExact('SLICE_DEPLOYMENT_CHANNEL', 'preview');
requireExact('SLICE_PUBLIC_BASE_PATH', '/preview');
requireExact('APP_ENV', 'beta');
requireExact('NODE_ENV', 'development');
requireExact('HOST', '127.0.0.1');
requireExact('PORT', '3201');
requireExact('SLICE_WEB_HOST', '127.0.0.1');
requireExact('SLICE_WEB_PORT', '3202');
requireExact('COOKIE_SECURE', 'true');
requireExact('REFRESH_COOKIE_NAME', 'slice_preview_refresh');
requireExact('REFRESH_COOKIE_PATH', '/preview/api/v1/auth');
requireExact('REDIS_KEY_PREFIX', 'slice:preview:');
requireExact('JWT_ISSUER', 'slice-preview-api');
requireExact('JWT_AUDIENCE', 'slice-preview-web');
requireExact('PROVIDER_MODE', 'local');
requireExact('STRIPE_LIVE_ENABLED', 'false');
requireExact('STRIPE_IDENTITY_ENABLED', 'false');
requireExact('XIMILAR_ENABLED', 'false');
requireExact('XIMILAR_CARD_GRADING_ENABLED', 'false');
requireExact('PRICECHARTING_ENABLED', 'false');
requireExact('OUTBOX_WORKER_ENABLED', 'false');
requireExact('MARKET_REFRESH_WORKER_ENABLED', 'false');
requireExact('OPERATIONAL_TRADING_ENABLED', 'false');
requireExact('OPERATIONAL_DEPOSITS_ENABLED', 'false');
requireExact('OPERATIONAL_WITHDRAWALS_ENABLED', 'false');
requireExact('OPERATIONAL_REALTIME_ENABLED', 'false');
requireExact('OPERATIONAL_LISTING_ENABLED', 'false');

if (env.COOKIE_DOMAIN?.trim()) {
  failures.push('COOKIE_DOMAIN must be omitted so preview uses a host-only cookie.');
}

const publicUrl = requireUrl('APP_PUBLIC_URL');
if (publicUrl) {
  if (publicUrl.protocol !== 'https:' || publicUrl.pathname.replace(/\/$/, '') !== '/preview') {
    failures.push('APP_PUBLIC_URL must be an HTTPS URL mounted exactly at /preview.');
  }
  const origins = (env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim());
  if (!origins.includes(publicUrl.origin)) {
    failures.push('CORS_ORIGINS must include the preview public origin.');
  }
  const viteApiUrl = requireUrl('VITE_API_BASE_URL');
  if (
    viteApiUrl &&
    viteApiUrl.toString().replace(/\/$/, '') !== publicUrl.toString().replace(/\/$/, '')
  ) {
    failures.push('VITE_API_BASE_URL must exactly match APP_PUBLIC_URL.');
  }
}

requireExact('VITE_DEPLOYMENT_CHANNEL', 'preview');
requireExact('VITE_PUBLIC_BASE_PATH', '/preview');
requireExact('VITE_DATA_SOURCE', 'api');
requirePostgresPreviewDatabase();
requirePreviewRedis();

if (failures.length) {
  console.error('Preview configuration is not isolated:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Preview configuration isolation check passed.');
