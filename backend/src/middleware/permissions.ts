import { Request, Response, NextFunction } from 'express';
import { AppModule, ReportKey } from '@prisma/client';
import { prisma } from '../utils/prisma';

type PermAction = 'view' | 'create' | 'edit' | 'delete';

// Department-matrix permission. NOTE: `RESORTS_SETUP` is NOT gated this way and no route passes it
// here any more -- Resorts Setup is granted PER USER via RESORTS_SETUP_ACCESS (see
// requireResortsSetupAccess below), so its matrix row is inert and the Departments screen hides it.
// If you are adding a Resorts Setup route, guard it with requireResortsSetupAccess, not this.
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

// `denyMessage` exists because this guard no longer only gates reports -- RESORTS_SETUP_ACCESS
// gates a whole module, and answering "Report access denied" there is just confusing.
export function requireReportAccess(reportKey: ReportKey, denyMessage = 'Report access denied') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.user.department.isLocked) { next(); return; }

    const access = await prisma.userReportAccess.findUnique({
      where: { userId_reportKey: { userId: req.user.id, reportKey } },
    });

    if (!access) { res.status(403).json({ error: denyMessage }); return; }
    next();
  };
}

// Resorts Setup (fns 1-10) is gated PER USER and ONLY per user -- this grant is the sole gate, the
// same way PBS_AUTO_TRANSFER replaces requirePermission on the PBS transfer routes. The
// RESORTS_SETUP department-matrix row is inert and hidden on the Departments screen, because a
// two-part rule was unmanageable: ticking the module granted nothing on its own, while unticking it
// silently revoked a granted user, and a newly created department bootstraps all-deny so a grant
// issued there would not have worked.
//
// Consequence: the grant is ALL-OR-NOTHING. There is no view/create/edit/delete split for Resorts
// Setup -- a granted user has full access. IT bypasses, as everywhere.
//
// The two deliberate exemptions are GET /api/resorts and GET /api/products, shared reference data
// the RCI pages also read -- see requireResortsReferenceRead below.
export const requireResortsSetupAccess = requireReportAccess(
  'RESORTS_SETUP_ACCESS',
  'Resorts Setup access denied',
);

// GET /api/resorts and GET /api/products are SHARED REFERENCE DATA: the Resorts Setup pages read
// them, and so do RCI fn 1 (resort + product dropdowns) and RCI fn 3 (resort dropdown), which sit
// on RESORT_BOOKING. So they are reachable by EITHER audience -- anyone holding the Resorts Setup
// grant, or anyone whose department has RESORT_BOOKING view. Deliberately not gated by the
// RESORTS_SETUP matrix, which is inert (see requirePermission above).
//
// Getting this wrong is silent: the hooks that read these have no onError, so a 403 just leaves
// the dropdowns empty with nothing on screen to explain it.
export function requireResortsReferenceRead() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.user.department.isLocked) { next(); return; }

    const grant = await prisma.userReportAccess.findUnique({
      where: { userId_reportKey: { userId: req.user.id, reportKey: 'RESORTS_SETUP_ACCESS' } },
    });
    if (grant) { next(); return; }

    const perm = await prisma.deptModulePermission.findUnique({
      where: { departmentId_module: { departmentId: req.user.departmentId, module: 'RESORT_BOOKING' } },
    });
    if (perm?.canView) { next(); return; }

    res.status(403).json({ error: 'Access denied' });
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

// IT or Member Services (for agreement nominees / RCI edits)
export function requireITorMemberServices(req: Request, res: Response, next: NextFunction): void {
  if (!req.user.department.isLocked && req.user.department.name !== 'Member Services') {
    res.status(403).json({ error: 'Member Services or IT access required' });
    return;
  }
  next();
}
