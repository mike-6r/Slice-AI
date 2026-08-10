import { assertStagingDemoSafety } from './staging-demo-safety';
import { runStagingDemoSetup } from './setup-staging-demo';

// The first refresh is intentionally conservative: it revalidates the durable
// accounts and public profile without deleting customer-facing history. Future
// fixture domains must add a scoped, audited refresh handler rather than using
// a database-wide reset.
void (async () => {
  assertStagingDemoSafety();
  await runStagingDemoSetup();
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Staging demo refresh failed.'}\n`,
  );
  process.exitCode = 1;
});
