import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

const userCreateSchema = z.object({
  fullName:     z.string().min(1),
  username:     z.string().min(3).max(50),
  email:        z.string().email(),
  phone:        z.string().optional(),
  departmentId: z.number().int().positive(),
  password:     z.string().min(8)
    .regex(/\d/, 'Must contain a number')
    .regex(/[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/, 'Must contain a special character'),
});

const userUpdateSchema = userCreateSchema.omit({ password: true }).partial();

const USER_SELECT = {
  id: true, fullName: true, username: true, email: true, phone: true,
  status: true, mustChangePwd: true,
  lastLoginAt: true, failedAttempts: true, lockedAt: true,
  createdAt: true, updatedAt: true,
  department: { select: { id: true, name: true } },
} as const;

function parsePagination(query: Record<string, unknown>) {
  const page  = Math.max(1, parseInt(String(query.page  ?? 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? 20), 10)));
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const { skip, take, page, limit } = parsePagination(req.query as Record<string, unknown>);
  const { search, departmentId, status } = req.query as Record<string, string>;

  const where: Record<string, unknown> = {};
  if (departmentId) where.departmentId = parseInt(departmentId, 10);
  if (status)       where.status = status;
  if (search)       where.OR = [
    { fullName: { contains: search, mode: 'insensitive' } },
    { username:  { contains: search, mode: 'insensitive' } },
    { email:     { contains: search, mode: 'insensitive' } },
  ];

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: USER_SELECT, skip, take, orderBy: { fullName: 'asc' } }),
  ]);
  res.json({ data: users, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { password, ...rest } = parsed.data;

  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  const passwordHash = await bcrypt.hash(password, rounds);

  try {
    const user = await prisma.user.create({
      data: { ...rest, passwordHash, mustChangePwd: true, updatedAt: new Date() },
      select: USER_SELECT,
    });
    await writeAudit({ userId: req.user.id, action: `Created user: ${user.username}`, actionType: 'CREATE', targetType: 'User', targetId: user.id });
    res.status(201).json({ data: user });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'Username or email already exists' });
    } else { throw e; }
  }
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ data: user });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  try {
    const user = await prisma.user.update({ where: { id }, data: { ...parsed.data, updatedAt: new Date() }, select: USER_SELECT });
    await writeAudit({ userId: req.user.id, action: `Updated user: ${user.username}`, actionType: 'UPDATE', targetType: 'User', targetId: id });
    res.json({ data: user });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'User not found' }); }
    else { throw e; }
  }
}

export async function toggleSuspend(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) { res.status(400).json({ error: 'Cannot suspend your own account' }); return; }

  const existing = await prisma.user.findUnique({ where: { id }, select: { status: true, username: true } });
  if (!existing) { res.status(404).json({ error: 'User not found' }); return; }

  const newStatus = existing.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  const user = await prisma.user.update({ where: { id }, data: { status: newStatus, updatedAt: new Date() }, select: USER_SELECT });
  await writeAudit({
    userId: req.user.id,
    action: `${newStatus === 'SUSPENDED' ? 'Suspended' : 'Reactivated'} user: ${existing.username}`,
    actionType: 'SUSPEND', targetType: 'User', targetId: id,
  });
  res.json({ data: user });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  const user = await prisma.user.findUnique({ where: { id }, select: { username: true } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  // Generate a temporary password: LHB + random 6-char alphanum + !
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const tempPassword = `LHB${rand}!`;
  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  const passwordHash = await bcrypt.hash(tempPassword, rounds);

  await prisma.user.update({
    where: { id },
    data: { passwordHash, mustChangePwd: true, failedAttempts: 0, lockedAt: null, updatedAt: new Date() },
  });
  await writeAudit({ userId: req.user.id, action: `Reset password for user: ${user.username}`, actionType: 'UPDATE', targetType: 'User', targetId: id });
  res.json({ message: 'Password reset successfully', tempPassword });
}

export async function cloneUser(req: Request, res: Response): Promise<void> {
  const sourceId = parseInt(req.params.id, 10);
  const bodySchema = z.object({
    fullName: z.string().min(1),
    username: z.string().min(3).max(50),
    email:    z.string().email(),
    phone:    z.string().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const source = await prisma.user.findUnique({ where: { id: sourceId }, select: { departmentId: true, username: true } });
  if (!source) { res.status(404).json({ error: 'Source user not found' }); return; }

  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const tempPassword = `LHB${rand}!`;
  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  const passwordHash = await bcrypt.hash(tempPassword, rounds);

  try {
    const user = await prisma.user.create({
      data: {
        ...parsed.data,
        passwordHash,
        mustChangePwd: true,
        departmentId: source.departmentId,
        updatedAt: new Date(),
      },
      select: USER_SELECT,
    });
    await writeAudit({ userId: req.user.id, action: `Cloned user ${source.username} → ${user.username}`, actionType: 'CREATE', targetType: 'User', targetId: user.id });
    res.status(201).json({ data: user, tempPassword });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Username or email already exists' }); }
    else { throw e; }
  }
}
