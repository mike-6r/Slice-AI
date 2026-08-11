import { assertStagingDemoSafety } from './staging-demo-safety';
import { runCollectorDemoSetup } from './setup-demo-collector';

// This rehydrates only stable, explicitly-tagged staging demo records through
// the existing D10/D11/D12/D13 service boundaries. It never deletes general
// staging data, resets the database, changes existing passwords or alters
// untagged customer/account history.
void (async () => {
  assertStagingDemoSafety();
  await runCollectorDemoSetup();
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Staging demo refresh failed.'}\n`,
  );
  process.exitCode = 1;
});
