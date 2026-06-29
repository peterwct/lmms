import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

interface NotInPbsRow {
  no: number;
  agreementNo: string;
  agreementDate: string;
  membershipNo: string;
  acctClassify: string;
}

async function buildRows(): Promise<NotInPbsRow[]> {
  const rows: Array<{
    agreementNo: string;
    agreementDate: Date;
    membershipNo: string;
    acctClassify: string;
  }> = await prisma.$queryRaw`
    SELECT
      a."agreementNo",
      a."agreementDate",
      m."membershipNo",
      a."acctClassify"
    FROM "Agreement" a
    JOIN "Member" m ON m."id" = a."memberId"
    WHERE a."coCode" IN ('03', '15')
      AND a."acctClassify" = 'NA'
      AND a."transferFlag" IS DISTINCT FROM 'TT'
      AND SUBSTRING(m."membershipNo" FROM 7 FOR 2) != 'MJ'
      AND a."agreementDate" >= '1994-09-27'
      AND a."agreementDate" <= '2012-07-11'
      AND NOT EXISTS (
        SELECT 1 FROM "PbsScheme" p
        WHERE p."coCode" = a."coCode"
          AND p."agreementNo" = a."agreementNo"
          AND p."pbsIndc" = true
      )
    ORDER BY a."coCode", a."agreementDate"
  `;

  return rows.map((r, i) => {
    const d = new Date(r.agreementDate);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return {
      no: i + 1,
      agreementNo: r.agreementNo,
      agreementDate: `${dd}-${mm}-${yyyy}`,
      membershipNo: r.membershipNo,
      acctClassify: r.acctClassify,
    };
  });
}

export async function previewNotInPbs(req: Request, res: Response): Promise<void> {
  const rows = await buildRows();
  res.json({ data: rows, meta: { total: rows.length } });
}

function buildTextReport(rows: NotInPbsRow[]): string {
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

  const lines: string[] = [];

  lines.push('');
  lines.push(`Entitle for Payback Scheme But Not in Zurich List     Date: ${dateStr}`);
  lines.push('');
  lines.push('No   Agmt       Agmt Date                          Status');
  lines.push('-'.repeat(70));

  for (const r of rows) {
    const line = `${String(r.no).padStart(4)} ${r.agreementNo.padEnd(11)}${r.agreementDate.padEnd(13)}${r.membershipNo.padEnd(22)}${r.acctClassify}`;
    lines.push(line);
  }

  lines.push('');
  return lines.join('\r\n');
}

export async function generateNotInPbs(req: Request, res: Response): Promise<void> {
  const rows = await buildRows();

  await writeAudit({
    userId: req.user!.id,
    action: `Generated Not In PBS report (Text): ${rows.length} records`,
    actionType: 'CREATE',
    targetType: 'Agreement',
    metadata: { count: rows.length } as any,
  });

  const text = buildTextReport(rows);

  const now = new Date();
  const d = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="not-in-pbs-${d}.txt"`);
  res.send(text);
}
