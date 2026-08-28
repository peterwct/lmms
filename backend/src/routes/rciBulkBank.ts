import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/rci-bulk-bank.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// RCI fn 3 is a whole-year grid, so there are no per-record routes: the year save is the
// only write path and it reconciles creates, updates AND deletes in one call. All three
// permissions are therefore required for it - a caller who may only create must not be
// able to clear a banked week through the same endpoint. Seed defaults give IT and Resort
// Ops all three, and everyone else at most view, so nothing is locked out today.
router.get('/units', requirePermission('RESORTS_SETUP', 'view'), ctrl.listBulkBankUnits);
router.get('/',      requirePermission('RESORTS_SETUP', 'view'), ctrl.listRciBulkBank);
router.post('/year',
  requirePermission('RESORTS_SETUP', 'create'),
  requirePermission('RESORTS_SETUP', 'edit'),
  requirePermission('RESORTS_SETUP', 'delete'),
  ctrl.saveRciBulkBankYear);
// Whole-year clear for re-entry. Only 'delete' - it removes and never writes, unlike the
// save above, so a delete-only user may run it.
router.delete('/year', requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteRciBulkBankYear);

export default router;
