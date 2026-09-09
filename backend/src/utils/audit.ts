import { AuditActionType, Prisma } from '@prisma/client';
import { prisma } from './prisma';

interface AuditParams {
  userId: number;
  action: string;
  actionType: AuditActionType;
  targetType?: string;
  targetId?: number;
  metadata?: Prisma.JsonObject;
  tx?: Prisma.TransactionClient;
}

// Every row snapshots WHO performed the action (actorUsername / actorName) alongside the
// userId FK. The FK is ON DELETE SET NULL, so when a user account is deleted its history
// survives and the Audit Log page can still name the actor. Resolved here rather than at
// the ~40 call sites, which only ever have req.user.id (req.user carries no fullName).
export async function writeAudit({
  userId,
  action,
  actionType,
  targetType,
  targetId,
  metadata,
  tx,
}: AuditParams): Promise<void> {
  const client = (tx ?? prisma) as Pick<typeof prisma, 'auditLog' | 'user'>;
  const actor = await client.user.findUnique({
    where: { id: userId },
    select: { username: true, fullName: true },
  });
  await client.auditLog.create({
    data: {
      userId,
      actorUsername: actor?.username ?? null,
      actorName: actor?.fullName ?? null,
      action,
      actionType,
      targetType,
      targetId,
      metadata,
    },
  });
}
