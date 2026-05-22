import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../../middleware/auth';
import { requirePermission, requireITorFinance } from '../../middleware/permissions';
import * as ctrl from '../../controllers/amc/rates.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/lhc',              requirePermission('AMC_BILLING', 'view'), ctrl.listLhcRates);
router.post('/lhc',             requireITorFinance,                       ctrl.createLhcRate);
router.put('/lhc/:id',          requireITorFinance,                       ctrl.updateLhcRate);
router.patch('/lhc/:id/toggle', requireITorFinance,                       ctrl.toggleLhcRate);
router.delete('/lhc/:id',       requireITorFinance,                       ctrl.deleteLhcRate);
router.get('/cp',               requirePermission('AMC_BILLING', 'view'), ctrl.listCpRates);
router.post('/cp',              requireITorFinance,                       ctrl.createCpRate);
router.put('/cp/:id',           requireITorFinance,                       ctrl.updateCpRate);
router.patch('/cp/:id/toggle',  requireITorFinance,                       ctrl.toggleCpRate);
router.delete('/cp/:id',        requireITorFinance,                       ctrl.deleteCpRate);

export default router;
