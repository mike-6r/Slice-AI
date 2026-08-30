import { PrismaClient } from '@prisma/client';

const retiredFixtureIds = ['staging-gb-intake', 'staging-us-intake'];

async function main() {
  if (
    process.env.APP_ENV !== 'beta' ||
    process.env.ALLOW_STAGING_INTAKE_LOCATION_RECONCILIATION !== 'true'
  )
    throw new Error(
      'Refusing intake-location reconciliation outside explicitly enabled beta staging.',
    );

  const db = new PrismaClient();
  try {
    const locations = await db.vaultIntakeLocation.findMany({
      where: { id: { in: retiredFixtureIds } },
      include: {
        _count: { select: { intakes: true, preferredBySubmissions: true } },
      },
    });
    const auditCounts = await db.auditEvent.groupBy({
      by: ['resourceId'],
      where: {
        resourceType: 'vault-intake-location',
        resourceId: { in: locations.map((location) => location.id) },
      },
      _count: { _all: true },
    });
    const auditCountByLocation = new Map(
      auditCounts.map((row) => [row.resourceId, row._count._all]),
    );
    const removed: string[] = [];
    const deactivated: string[] = [];
    const alreadyInactive: string[] = [];
    for (const location of locations) {
      const hasHistory =
        location._count.intakes > 0 ||
        location._count.preferredBySubmissions > 0 ||
        (auditCountByLocation.get(location.id) ?? 0) > 0;
      if (!hasHistory) {
        await db.$transaction([
          db.auditEvent.create({
            data: {
              actorType: 'SYSTEM',
              action: 'INTAKE_LOCATION_LEGACY_FIXTURE_REMOVED',
              resourceType: 'vault-intake-location',
              resourceId: location.id,
              requestId: 'staging-intake-location-reconciliation',
              result: 'SUCCESS',
              metadata: {
                reason:
                  'Unreferenced duplicate legacy staging fixture retired; one UK test facility remains authoritative.',
              },
            },
          }),
          db.vaultIntakeLocation.delete({ where: { id: location.id } }),
        ]);
        removed.push(location.id);
        continue;
      }
      if (
        location.status === 'INACTIVE' &&
        !location.active &&
        !location.intakeAvailable
      ) {
        alreadyInactive.push(location.id);
        continue;
      }
      await db.$transaction([
        db.vaultIntakeLocation.update({
          where: { id: location.id },
          data: {
            active: false,
            intakeAvailable: false,
            operationallyApproved: false,
            status: 'INACTIVE',
          },
        }),
        db.auditEvent.create({
          data: {
            actorType: 'SYSTEM',
            action: 'INTAKE_LOCATION_LEGACY_FIXTURE_DEACTIVATED',
            resourceType: 'vault-intake-location',
            resourceId: location.id,
            requestId: 'staging-intake-location-reconciliation',
            result: 'SUCCESS',
            metadata: {
              reason:
                'Legacy staging fixture has historical references and was deactivated instead of deleted.',
            },
          },
        }),
      ]);
      deactivated.push(location.id);
    }
    process.stdout.write(
      JSON.stringify({
        result: 'STAGING_INTAKE_LOCATIONS_RECONCILED',
        removed,
        deactivated,
        alreadyInactive,
      }) + '\n',
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Intake location reconciliation failed.'}\n`,
  );
  process.exitCode = 1;
});
