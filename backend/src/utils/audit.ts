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

export async function writeAudit({
  userId,
  action,
  actionType,
  targetType,
  targetId,
  metadata,
  tx,
}: AuditParams): Promise<void> {
  const client = (tx ?? prisma) as Pick<typeof prisma, 'auditLog'>;
  await client.auditLog.create({
    data: { userId, action, actionType, targetType, targetId, metadata },
  });
}
