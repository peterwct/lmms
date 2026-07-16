import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../../middleware/auth';
import { requirePermission, requireITorCredit } from '../../middleware/permissions';
import * as ctrl from '../../controllers/amc/invoices.controller';

const router = Router({ mergeParams: true });
router.use(authenticate, requirePasswordChanged);

router.get('/',            requirePermission('AMC_BILLING', 'view'), ctrl.listInvoices);
router.get('/cancellable', requireITorCredit,                        ctrl.listCancellableInvoices);
router.post('/generate',   requireITorCredit,                        ctrl.generateInvoices);
router.post('/:id/cancel', requireITorCredit,                        ctrl.cancelInvoice);
router.get('/:id',         requirePermission('AMC_BILLING', 'view'), ctrl.getInvoice);
router.get('/:id/download', requirePermission('AMC_BILLING', 'view'), ctrl.downloadInvoicePdf);

export default router;
