import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/rci-bulk-bank.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// RCI fn 3 is a whole-year grid, so there are no per-record routes: the year save is the
// only write path and it reconciles creates, updates AND deletes in one call. All three
// permissions are therefore required for it - a caller who may only create must not be
// able to clear a banked week through the same endpoint. RCI runs on RESORT_BOOKING (not
// RESORTS_SETUP, which is now Resorts Setup only), where IT, Member Services and Resort
// Ops all hold create+edit+delete, so nothing is locked out today.
router.get('/units', requirePermission('RESORT_BOOKING', 'view'), ctrl.listBulkBankUnits);
router.get('/',      requirePermission('RESORT_BOOKING', 'view'), ctrl.listRciBulkBank);
router.post('/year',
  requirePermission('RESORT_BOOKING', 'create'),
  requirePermission('RESORT_BOOKING', 'edit'),
  requirePermission('RESORT_BOOKING', 'delete'),
  ctrl.saveRciBulkBankYear);
// Whole-year clear for re-entry. Only 'delete' - it removes and never writes, unlike the
// save above, so a delete-only user may run it.
router.delete('/year', requirePermission('RESORT_BOOKING', 'delete'), ctrl.deleteRciBulkBankYear);

export default router;
