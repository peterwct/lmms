import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../utils/prisma';

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req.cookies as Record<string, string>)?.token;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        status: true,
        lockedAt: true,
        mustChangePwd: true,
        departmentId: true,
        sessionToken: true,
        department: { select: { id: true, name: true, isLocked: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      res.status(401).json({ error: 'Account inactive or not found' });
      return;
    }
    if (user.lockedAt) {
      res.status(401).json({ error: 'Account locked. Contact IT to unlock.' });
      return;
    }
    if (user.sessionToken !== payload.sessionToken) {
      res.status(401).json({ error: 'Session ended. Please log in again.' });
      return;
    }
    req.user = {
      id: user.id,
      username: user.username,
      departmentId: user.departmentId,
      department: user.department,
      mustChangePwd: user.mustChangePwd,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requirePasswordChanged(req: Request, res: Response, next: NextFunction): void {
  if (req.user.mustChangePwd) {
    res.status(403).json({ error: 'Password change required before proceeding', mustChangePwd: true });
    return;
  }
  next();
}
