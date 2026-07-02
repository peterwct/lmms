import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission, requireITorMemberServices } from '../middleware/permissions';
import * as ctrl from '../controllers/agreements.controller';
import * as nomCtrl from '../controllers/nominees.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',                    requirePermission('AGREEMENTS', 'view'),   ctrl.listAgreements);
router.get('/:id',                 requirePermission('AGREEMENTS', 'view'),   ctrl.getAgreement);
router.put('/:id',                 requireITorMemberServices,                 ctrl.updateAgreement);
router.patch('/:id/status',        ctrl.changeAgreementStatus);   // authorization is department + status dependent — enforced in controller
router.put('/:id/nominees',        requireITorMemberServices,                 nomCtrl.updateNominees);

export default router;
