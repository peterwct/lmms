import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

const TIN_REGEX = /^(C|SG|OG|D)\d+$/;

// Helpers: all optional fields also accept null so clearing a field in the UI
// sends null and the backend stores it as NULL in the database.
const os  = z.string().nullish();              // optional nullable string
const os1 = z.string().max(1).nullish();       // single-char fields
const odt = z.string().datetime().nullish();   // optional nullable datetime

const memberSchema = z.object({
  membershipNo:  z.string().min(1),
  memberType:    z.enum(['INDIVIDUAL', 'CORPORATE']),
  fullName:      z.string().min(1),
  branchCode:    os, accpacRef: os, subsCategory: os,
  salutation:    os, nameCard:  os,
  icOld:         os, icNew:     os, nationality:  os,
  dateOfBirth:   odt,
  gender:        os1, race: os1, maritalStatus: os1,
  email:         z.string().email().nullish(),
  telHome:       os, telMobile: os, faxNo: os,
  // Residential address
  resAdd1: os, resAdd2: os, resAdd3: os,
  resCityState: os, resPostcode: os, resStateCode: os,
  // Mailing address
  mailAdd1: os, mailAdd2: os, mailAdd3: os,
  mailCityState: os, mailPostcode: os, mailStateCode: os,
  // Employment
  workNature: os, companyName: os,
  compAdd1: os, compAdd2: os, compAdd3: os,
  compCityState: os, compPostcode: os, compStateCode: os,
  telOffice: os, telOffice2: os, faxOffice: os, designation: os,
  // Spouse
  spouseName: os, spouseIc: os,
  // Joint applicant
  jaName: os, jaIc: os, jaIcNew: os,
  jaSalutation: os, jaDesignation: os, jaNameCard: os,
  jaAdd1: os, jaAdd2: os, jaAdd3: os,
  jaCity: os, jaPostcode: os, jaState: os,
  jaTelHome: os, jaTelOffice: os, jaMobile: os,
  jaEmail: z.string().email().nullish(),
  // Corporate
  registrationNo: os, incorporationDate: odt, businessNature: os,
  // e-Invoice
  tinNumber: z.string().max(15).regex(TIN_REGEX, 'Invalid TIN format (C/SG/OG/D + digits)').nullish(),
  // System
  enrolRci: z.boolean().optional(),
  activeHcm: z.boolean().optional(),
  remarks: os,
});

// null → keep as null (clears the DB field); undefined/missing → keep existing; string → parse to Date
const toDate = (v: string | null | undefined): Date | null | undefined => {
  if (v === null) return null;
  if (!v)         return undefined;
  return new Date(v);
};

function parsePagination(query: Record<string, unknown>) {
  const page  = Math.max(1, parseInt(String(query.page  ?? 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? 20), 10)));
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export async function listMembers(req: Request, res: Response): Promise<void> {
  const { skip, take, page, limit } = parsePagination(req.query as Record<string, unknown>);
  const { search, memberType, status, coCode, branchCode } = req.query as Record<string, string>;

  // Build where clause
  const andClauses: object[] = [];

  if (memberType)  andClauses.push({ memberType });
  if (status)      andClauses.push({ status });
  if (branchCode)  andClauses.push({ branchCode });

  if (coCode) {
    // Filter by coCode via agreements join
    andClauses.push({ agreements: { some: { coCode } } });
  }

  if (search) {
    andClauses.push({
      OR: [
        { membershipNo: { contains: search, mode: 'insensitive' } },
        { fullName:     { contains: search, mode: 'insensitive' } },
        { icNew:        { contains: search, mode: 'insensitive' } },
        { icOld:        { contains: search, mode: 'insensitive' } },
        { telMobile:    { contains: search, mode: 'insensitive' } },
        { telHome:      { contains: search, mode: 'insensitive' } },
        { email:        { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const where = andClauses.length > 0 ? { AND: andClauses } : {};

  const [total, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      select: {
        id: true, membershipNo: true, memberType: true, fullName: true,
        branchCode: true, status: true, email: true, telMobile: true,
        icNew: true, createdAt: true,
        agreements: { select: { id: true, agreementNo: true, coCode: true, acctClassify: true } },
      },
      orderBy: { fullName: 'asc' },
      skip, take,
    }),
  ]);
  res.json({ data: members, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
}

export async function createMember(req: Request, res: Response): Promise<void> {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  // Transform date strings to Date objects
  const data = {
    ...parsed.data,
    dateOfBirth:       toDate(parsed.data.dateOfBirth),
    incorporationDate: toDate(parsed.data.incorporationDate),
    id: randomUUID(),
    updatedAt: new Date(),
  };

  try {
    const member = await prisma.member.create({ data });
    await writeAudit({ userId: req.user.id, action: `Created member: ${member.membershipNo}`, actionType: 'CREATE', targetType: 'Member', targetId: undefined, metadata: { memberId: member.id } });
    res.status(201).json({ data: member });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Membership number already exists' }); }
    else { throw e; }
  }
}

export async function getMember(req: Request, res: Response): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { id: req.params.id },
    include: {
      agreements: {
        include: {
          nominees:    { orderBy: { nomineeSeq: 'asc' } },
          amcSchedule: true,
          pbsScheme:   true,
        },
        orderBy: { agreementDate: 'desc' },
      },
    },
  });
  if (!member) { res.status(404).json({ error: 'Member not found' }); return; }
  res.json({ data: member });
}

export async function updateMember(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const parsed = memberSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const data = {
    ...parsed.data,
    dateOfBirth:       toDate(parsed.data.dateOfBirth),
    incorporationDate: toDate(parsed.data.incorporationDate),
  };

  try {
    const member = await prisma.member.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
    await writeAudit({ userId: req.user.id, action: `Updated member: ${member.membershipNo}`, actionType: 'UPDATE', targetType: 'Member', metadata: { memberId: id } });
    res.json({ data: member });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Member not found' }); }
    else { throw e; }
  }
}

export async function changeMemberStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const { status } = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED', 'DECEASED', 'TRANSFERRED']) }).parse(req.body);

  const member = await prisma.member.update({ where: { id }, data: { status, updatedAt: new Date() } });
  await writeAudit({ userId: req.user.id, action: `Changed member status to ${status}: ${member.membershipNo}`, actionType: 'UPDATE', targetType: 'Member', metadata: { memberId: id } });
  res.json({ data: member });
}
