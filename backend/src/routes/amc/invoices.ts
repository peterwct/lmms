import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import * as ctrl from '../../controllers/amc/invoices.controller';

const router = Router({ mergeParams: true });
router.use(authenticate, requirePasswordChanged);

router.get('/',            requirePermission('AMC_BILLING', 'view'), ctrl.listInvoices);
router.get('/cancellable', requirePermission('AMC_BILLING', 'edit'), ctrl.listCancellableInvoices);
router.post('/generate',   requirePermission('AMC_BILLING', 'edit'), ctrl.generateInvoices);
router.post('/:id/cancel', requirePermission('AMC_BILLING', 'edit'), ctrl.cancelInvoice);
router.get('/:id',         requirePermission('AMC_BILLING', 'view'), ctrl.getInvoice);
router.get('/:id/download', requirePermission('AMC_BILLING', 'view'), ctrl.downloadInvoicePdf);

export default router;
