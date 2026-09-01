import { assertStagingDemoSafety } from './staging-demo-safety';
import { runStagingDemoSetup } from './setup-staging-demo';

// Refresh only the explicitly configured staging identities. Synthetic
// collectible, review, intake, ownership, offering, and market records were
// retired and must not be recreated by an environment refresh.
void (async () => {
  assertStagingDemoSafety();
  await runStagingDemoSetup();
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Staging demo refresh failed.'}\n`,
  );
  process.exitCode = 1;
});
