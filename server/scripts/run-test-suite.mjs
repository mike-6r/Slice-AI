import { spawnSync } from "node:child_process";

const suite = process.argv[2];
if (!suite || !["integration", "e2e"].includes(suite)) {
  throw new Error("Usage: node scripts/run-test-suite.mjs <integration|e2e>");
}

const configuredTestDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://slice_test:slice_test_only@127.0.0.1:55432/slice_test";
const parsedTestDatabaseUrl = new URL(configuredTestDatabaseUrl);
if (
  parsedTestDatabaseUrl.protocol !== "postgresql:" ||
  !["127.0.0.1", "localhost"].includes(parsedTestDatabaseUrl.hostname) ||
  parsedTestDatabaseUrl.pathname !== "/slice_test"
) {
  throw new Error(
    "Refusing to run automated suites against a non-local slice_test database.",
  );
}
// Prisma's timestamp-without-time-zone columns are compared by the worker
// repositories through raw SQL. Pin the isolated test session to UTC so an
// injected test clock compares as the same instant on every developer host.
parsedTestDatabaseUrl.searchParams.set("options", "-c TimeZone=UTC");
const testDatabaseUrl = parsedTestDatabaseUrl.toString();
const env = {
  ...process.env,
  NODE_ENV: "test",
  PROVIDER_MODE: process.env.PROVIDER_MODE ?? "local",
  TEST_DATABASE_URL: testDatabaseUrl,
  // Never inherit a deployment DATABASE_URL/REDIS_URL into an automated test.
  DATABASE_URL: testDatabaseUrl,
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379",
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ?? "slice-local-test-access-secret-change-me",
  PROVIDER_ENCRYPTION_KEY:
    process.env.PROVIDER_ENCRYPTION_KEY ??
    "slice-local-test-provider-encryption-key-change-me-32",
  TWO_FACTOR_ENCRYPTION_KEY:
    process.env.TWO_FACTOR_ENCRYPTION_KEY ??
    "slice-local-test-two-factor-encryption-key-change-me-32",
  COOKIE_SECURE: process.env.COOKIE_SECURE ?? "false",
  CAPTCHA_ENABLED: "false",
  CAPTCHA_PROVIDER: "local_test",
  SIGNUP_CONSENT_REQUIRED: "false",
  PHONE_DELIVERY_MODE: "local_test",
  EMAIL_DELIVERY_MODE: "local_test",
};

const npm = process.platform === "win32" ? "npx.cmd" : "npx";
// Every invocation owns the test database. Resetting only this test-only URL
// prevents interrupted suites from leaking processing claims, rate-limit keys,
// users, and fixture rows into the next run; staging/production URLs are
// rejected by the runner before this command can execute.
const migration = spawnSync(npm, ["prisma", "migrate", "reset", "--force", "--skip-seed"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  shell: true,
});
if (migration.error) {
  console.error(`Unable to start Prisma migration: ${migration.error.message}`);
  process.exit(1);
}
if (migration.status !== 0) process.exit(migration.status ?? 1);

const config = suite === "integration" ? "./test/jest-integration.json" : "./test/jest-e2e.json";
const args = ["jest", "--config", config, "--runInBand"];
if (suite === "e2e") args.push("--detectOpenHandles");
args.push(...process.argv.slice(3));
const result = spawnSync(npm, args, {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  shell: true,
});
if (result.error) {
  console.error(`Unable to start Jest: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
