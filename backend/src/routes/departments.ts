import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission, requireIT } from '../middleware/permissions';
import * as ctrl from '../controllers/departments.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',                           requirePermission('ADMIN', 'view'),   ctrl.listDepartments);
router.post('/',                          requirePermission('ADMIN', 'create'), ctrl.createDepartment);
router.put('/:id',                        requirePermission('ADMIN', 'edit'),   ctrl.updateDepartment);
router.delete('/:id',                     requirePermission('ADMIN', 'delete'), ctrl.deleteDepartment);
router.get('/:id/permissions',            requirePermission('ADMIN', 'view'),   ctrl.getPermissions);
router.put('/:id/permissions',            requireIT,                            ctrl.updatePermissions);

export default router;
