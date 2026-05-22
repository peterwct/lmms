import { Request, Response } from 'express';
import { z } from 'zod';
import { AppModule } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

const ALL_MODULES = Object.values(AppModule);

const deptSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().optional(),
});

const permSchema = z.record(
  z.enum(ALL_MODULES as [AppModule, ...AppModule[]]),
  z.object({
    canView:   z.boolean(),
    canCreate: z.boolean(),
    canEdit:   z.boolean(),
    canDelete: z.boolean(),
  })
);

export async function listDepartments(_req: Request, res: Response): Promise<void> {
  const depts = await prisma.department.findMany({
    include: {
      _count: { select: { users: true } },
      permissions: { select: { module: true, canView: true, canCreate: true, canEdit: true, canDelete: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ data: depts });
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  const parsed = deptSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  try {
    const dept = await prisma.$transaction(async (tx) => {
      const d = await tx.department.create({ data: parsed.data });
      // Bootstrap permission rows (all deny) for every module
      await tx.deptModulePermission.createMany({
        data: ALL_MODULES.map((module) => ({ departmentId: d.id, module })),
      });
      return d;
    });
    await writeAudit({ userId: req.user.id, action: `Created department: ${dept.name}`, actionType: 'CREATE', targetType: 'Department', targetId: dept.id });
    res.status(201).json({ data: dept });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Department name already exists' }); }
    else { throw e; }
  }
}

export async function updateDepartment(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }
  if (dept.isLocked) { res.status(400).json({ error: 'Locked department cannot be edited' }); return; }

  const parsed = deptSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const updated = await prisma.department.update({ where: { id }, data: parsed.data });
  await writeAudit({ userId: req.user.id, action: `Updated department: ${updated.name}`, actionType: 'UPDATE', targetType: 'Department', targetId: id });
  res.json({ data: updated });
}

export async function deleteDepartment(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  const dept = await prisma.department.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }
  if (dept.isLocked) { res.status(400).json({ error: 'Cannot delete locked department' }); return; }
  if (dept._count.users > 0) { res.status(400).json({ error: 'Cannot delete department with assigned users' }); return; }

  await prisma.$transaction([
    prisma.deptModulePermission.deleteMany({ where: { departmentId: id } }),
    prisma.department.delete({ where: { id } }),
  ]);
  await writeAudit({ userId: req.user.id, action: `Deleted department: ${dept.name}`, actionType: 'DELETE', targetType: 'Department', targetId: id });
  res.json({ message: 'Department deleted' });
}

export async function getPermissions(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  const dept = await prisma.department.findUnique({
    where: { id },
    include: { permissions: { orderBy: { module: 'asc' } } },
  });
  if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }
  res.json({ data: dept });
}

export async function updatePermissions(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }
  if (dept.isLocked) { res.status(400).json({ error: 'Cannot modify permissions of locked IT department' }); return; }

  const parsed = permSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  await prisma.$transaction(
    Object.entries(parsed.data).map(([module, perms]) =>
      prisma.deptModulePermission.upsert({
        where: { departmentId_module: { departmentId: id, module: module as AppModule } },
        update: perms,
        create: { departmentId: id, module: module as AppModule, ...perms },
      })
    )
  );
  await writeAudit({ userId: req.user.id, action: `Updated permissions for: ${dept.name}`, actionType: 'UPDATE', targetType: 'Department', targetId: id });
  res.json({ message: 'Permissions updated' });
}
