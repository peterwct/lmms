import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50), 10)));
  const { userId, actionType, targetType, from, to } = req.query as Record<string, string>;

  const where: Record<string, unknown> = {};
  if (userId)     where.userId     = parseInt(userId, 10);
  if (actionType) where.actionType = actionType;
  if (targetType) where.targetType = targetType;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    };
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, username: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  res.json({ data: logs, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
}
