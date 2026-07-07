import { Request, Response } from 'express';
import { ReportKey } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const ALL_REPORT_KEYS: ReportKey[] = ['MEMBER_REPORT', 'AGREEMENT_REPORT', 'EXPIRY_REPORT', 'EXPIRING_MEMBER_REPORT', 'REMAINING_VALUE_REPORT', 'EXPIRY_SUMMARY_REPORT', 'PBS_PAY_BY_MONTH_REPORT', 'PBS_CLAIM_REPORT', 'PBS_NOT_IN_PBS_REPORT', 'PBS_VARIANCE_REPORT', 'PBS_AUTO_TRANSFER'];

const REPORT_LABELS: Record<ReportKey, string> = {
  MEMBER_REPORT:           'Member Report',
  AGREEMENT_REPORT:        'SSM Agreement Report',
  EXPIRY_REPORT:           'Senior Management Report - Analysis of Agreement Expiry',
  EXPIRING_MEMBER_REPORT:  'List of Expiring Members',
  REMAINING_VALUE_REPORT:  'Remaining Value Report',
  EXPIRY_SUMMARY_REPORT:   'Summary of Expiring Members by Years',
  PBS_PAY_BY_MONTH_REPORT: 'PBS Pay By Month/Year Report',
  PBS_CLAIM_REPORT:        'PBS Claim Report',
  PBS_NOT_IN_PBS_REPORT:   'Not In PBS Report',
  PBS_VARIANCE_REPORT:     'PBS Variance Report',
  PBS_AUTO_TRANSFER:       'PBS Auto Transfer to Claim',
};

export async function getReportAccess(req: Request, res: Response): Promise<void> {
  const userId = Number(req.params.userId);

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, department: { select: { isLocked: true } } },
  });

  if (!targetUser) { res.status(404).json({ error: 'User not found' }); return; }

  const grants = await prisma.userReportAccess.findMany({
    where: { userId },
    include: { grantedBy: { select: { id: true, fullName: true } } },
  });

  const grantMap = new Map(grants.map(g => [g.reportKey, g]));

  const result = ALL_REPORT_KEYS.map(reportKey => {
    const grant = grantMap.get(reportKey);
    return {
      reportKey,
      label: REPORT_LABELS[reportKey],
      granted: targetUser.department.isLocked ? true : !!grant,
      grantedAt: grant?.grantedAt ?? null,
      grantedBy: grant?.grantedBy ?? null,
      itOverride: targetUser.department.isLocked,
    };
  });

  res.json({ data: result });
}

export async function grantReportAccess(req: Request, res: Response): Promise<void> {
  const userId = Number(req.params.userId);
  const reportKey = req.params.reportKey as ReportKey;

  if (!ALL_REPORT_KEYS.includes(reportKey)) {
    res.status(400).json({ error: 'Invalid report key' });
    return;
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true } });
  if (!targetUser) { res.status(404).json({ error: 'User not found' }); return; }

  await prisma.userReportAccess.upsert({
    where: { userId_reportKey: { userId, reportKey } },
    create: {
      userId,
      reportKey,
      grantedById: req.user.id,
      grantedAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      grantedById: req.user.id,
      grantedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await writeAudit({
    userId: req.user.id,
    action: `Granted ${REPORT_LABELS[reportKey]} access to ${targetUser.fullName}`,
    actionType: 'CREATE',
    targetType: 'UserReportAccess',
    targetId: userId,
    metadata: { reportKey },
  });

  res.json({ message: 'Access granted' });
}

export async function revokeReportAccess(req: Request, res: Response): Promise<void> {
  const userId = Number(req.params.userId);
  const reportKey = req.params.reportKey as ReportKey;

  if (!ALL_REPORT_KEYS.includes(reportKey)) {
    res.status(400).json({ error: 'Invalid report key' });
    return;
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true } });
  if (!targetUser) { res.status(404).json({ error: 'User not found' }); return; }

  const existing = await prisma.userReportAccess.findUnique({
    where: { userId_reportKey: { userId, reportKey } },
  });

  if (!existing) { res.status(404).json({ error: 'Access not found' }); return; }

  await prisma.userReportAccess.delete({
    where: { userId_reportKey: { userId, reportKey } },
  });

  await writeAudit({
    userId: req.user.id,
    action: `Revoked ${REPORT_LABELS[reportKey]} access from ${targetUser.fullName}`,
    actionType: 'DELETE',
    targetType: 'UserReportAccess',
    targetId: userId,
    metadata: { reportKey },
  });

  res.json({ message: 'Access revoked' });
}
