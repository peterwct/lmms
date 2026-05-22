import { Request, Response, NextFunction } from 'express';
import { AppModule } from '@prisma/client';
import { prisma } from '../utils/prisma';

type PermAction = 'view' | 'create' | 'edit' | 'delete';

export function requirePermission(module: AppModule, action: PermAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // IT department (isLocked = true) always has full access
    if (req.user.department.isLocked) { next(); return; }

    const perm = await prisma.deptModulePermission.findUnique({
      where: { departmentId_module: { departmentId: req.user.departmentId, module } },
    });

    const allowed: boolean = perm
      ? ({ view: perm.canView, create: perm.canCreate, edit: perm.canEdit, delete: perm.canDelete })[action]
      : false;

    if (!allowed) { res.status(403).json({ error: 'Access denied' }); return; }
    next();
  };
}

// IT only (for audit log, account lock/unlock)
export function requireIT(req: Request, res: Response, next: NextFunction): void {
  if (!req.user.department.isLocked) {
    res.status(403).json({ error: 'IT department access required' });
    return;
  }
  next();
}

// IT or Finance (for rate master add/edit)
export function requireITorFinance(req: Request, res: Response, next: NextFunction): void {
  if (!req.user.department.isLocked && req.user.department.name !== 'Finance') {
    res.status(403).json({ error: 'Finance or IT access required' });
    return;
  }
  next();
}

// IT or Credit (for invoice generation and day-end files)
export function requireITorCredit(req: Request, res: Response, next: NextFunction): void {
  if (!req.user.department.isLocked && req.user.department.name !== 'Credit') {
    res.status(403).json({ error: 'Credit or IT access required' });
    return;
  }
  next();
}
