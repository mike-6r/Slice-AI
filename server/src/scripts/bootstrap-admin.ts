import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { sanitizeAuditMetadata } from '../modules/identity/domain/audit';

export async function bootstrapAdministrator(
  prisma: PrismaClient,
  email: string,
  operator: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(54870615)`);
    const user = await tx.user.findUnique({
      where: { normalizedEmail: email },
    });
    if (!user) throw new Error('Existing user not found.');
    const existing = await tx.roleAssignment.count({
      where: {
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        revokedAt: null,
        user: { accountStatus: { in: ['ACTIVE', 'PENDING_REVIEW'] } },
      },
    });
    if (existing > 0)
      throw new Error('An active administrator already exists.');
    await tx.roleAssignment.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });
    const metadata = sanitizeAuditMetadata('ADMIN_BOOTSTRAPPED', { operator });
    await tx.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'ADMIN_BOOTSTRAPPED',
        resourceType: 'user',
        resourceId: user.id,
        requestId: `bootstrap:${operator}`,
        sessionId: null,
        result: 'SUCCESS',
        metadata:
          metadata === null
            ? Prisma.JsonNull
            : (metadata as Prisma.InputJsonValue),
      },
    });
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const operator = process.argv[3]?.trim();
  if (!email || !operator || operator.length > 128) {
    throw new Error(
      'Usage: npm run bootstrap:admin -- <existing-user-email> <operator-id>',
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    await bootstrapAdministrator(prisma, email, operator);
    process.stdout.write('Administrator bootstrap completed.\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Bootstrap failed.'}\n`,
    );
    process.exitCode = 1;
  });
}
