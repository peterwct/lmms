import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission, requireIT } from '../middleware/permissions';
import * as ctrl from '../controllers/users.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',              requirePermission('ADMIN', 'view'),   ctrl.listUsers);
router.post('/',             requirePermission('ADMIN', 'create'), ctrl.createUser);
router.get('/:id',           requirePermission('ADMIN', 'view'),   ctrl.getUser);
router.put('/:id',           requirePermission('ADMIN', 'edit'),   ctrl.updateUser);
router.patch('/:id/suspend', requirePermission('ADMIN', 'edit'),   ctrl.toggleSuspend);
router.patch('/:id/reset-password', requireIT,                     ctrl.resetPassword);
router.post('/:id/clone',    requirePermission('ADMIN', 'create'), ctrl.cloneUser);

export default router;
