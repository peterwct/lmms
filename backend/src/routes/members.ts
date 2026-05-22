import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/members.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',              requirePermission('MEMBERS', 'view'),   ctrl.listMembers);
router.post('/',             requirePermission('MEMBERS', 'create'), ctrl.createMember);
router.get('/:id',           requirePermission('MEMBERS', 'view'),   ctrl.getMember);
router.put('/:id',           requirePermission('MEMBERS', 'edit'),   ctrl.updateMember);
router.patch('/:id/status',  requirePermission('MEMBERS', 'edit'),   ctrl.changeMemberStatus);

export default router;
