import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { signToken } from '../utils/jwt';
import { writeAudit } from '../utils/audit';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const pwdSchema = z
  .string()
  .min(8, 'Minimum 8 characters')
  .regex(/\d/, 'Must contain at least one number')
  .regex(/[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/, 'Must contain at least one special character');

const changePwdSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: pwdSchema,
});

const JWT_MS = (() => {
  const raw = process.env.JWT_EXPIRES_IN ?? '30m';
  const m = raw.match(/^(\d+)(m|h|d)$/);
  if (!m) return 30 * 60 * 1000;
  const n = parseInt(m[1], 10);
  return m[2] === 'h' ? n * 3600_000 : m[2] === 'd' ? n * 86400_000 : n * 60_000;
})();

const COOKIE_OPTS = {
  httpOnly: true,
  // Use COOKIE_SECURE=false to allow plain HTTP on test servers (default: true in production)
  secure: process.env.COOKIE_SECURE === 'false' ? false : process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: JWT_MS,
};

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }
  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      department: {
        select: {
          id: true, name: true, isLocked: true,
          permissions: { select: { module: true, canView: true, canCreate: true, canEdit: true, canDelete: true } },
        },
      },
    },
  });

  if (!user) { res.status(401).json({ error: 'Invalid credentials' }); return; }
  if (user.lockedAt) { res.status(401).json({ error: 'Account locked. Contact IT to unlock.' }); return; }
  if (user.status !== 'ACTIVE') { res.status(401).json({ error: 'Account suspended.' }); return; }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    const attempts = user.failedAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: attempts, ...(attempts >= 5 ? { lockedAt: new Date() } : {}), updatedAt: new Date() },
    });
    const msg = attempts >= 5
      ? 'Account locked after 5 failed attempts. Contact IT.'
      : `Invalid credentials. ${5 - attempts} attempt(s) remaining.`;
    res.status(401).json({ error: msg });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedAt: null, lastLoginAt: new Date(), updatedAt: new Date() },
  });
  await writeAudit({ userId: user.id, action: `Login: ${username}`, actionType: 'LOGIN' });

  const token = signToken({ userId: user.id, username: user.username });
  res.cookie('token', token, COOKIE_OPTS);
  res.json({
    user: {
      id: user.id, fullName: user.fullName, username: user.username,
      email: user.email,
      department: user.department, mustChangePwd: user.mustChangePwd,
    },
  });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const parsed = changePwdSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  if (!user.mustChangePwd) {
    if (!currentPassword) { res.status(400).json({ error: 'currentPassword required' }); return; }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) { res.status(401).json({ error: 'Current password incorrect' }); return; }
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  const passwordHash = await bcrypt.hash(newPassword, rounds);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePwd: false, updatedAt: new Date() } });
  await writeAudit({ userId: user.id, action: `Password changed: ${user.username}`, actionType: 'UPDATE', targetType: 'User', targetId: user.id });
  res.json({ message: 'Password changed successfully' });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true, fullName: true, username: true, email: true, phone: true,
      status: true, mustChangePwd: true, lastLoginAt: true,
      department: {
        select: {
          id: true, name: true, isLocked: true,
          permissions: { select: { module: true, canView: true, canCreate: true, canEdit: true, canDelete: true } },
        },
      },
    },
  });
  res.json({ user });
}
