import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireResortsReferenceRead, requireResortsSetupAccess } from '../middleware/permissions';
import * as ctrl from '../controllers/resorts.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// SHARED REFERENCE READ, declared BEFORE the grant guard below so the guard does not apply to it.
// RCI fn 1 (useRciResorts) and RCI fn 3 (useActiveResorts) both read this for their resort
// dropdowns, and RCI runs on RESORT_BOOKING -- so it must stay reachable without the Resorts Setup
// grant. Keep it above the router.use; moving it down silently empties those dropdowns.
router.get('/', requireResortsReferenceRead(), ctrl.listResorts);

// Everything below is Resorts Setup fn 2 proper: granted per user, all-or-nothing.
router.use(requireResortsSetupAccess);

router.get('/:id',          ctrl.getResort);
router.post('/',            ctrl.createResort);
router.put('/:id/info',     ctrl.updateResortInfo);
router.put('/:id',          ctrl.updateResort);
router.patch('/:id/toggle', ctrl.toggleResortStatus);
router.delete('/:id',       ctrl.deleteResort);

export default router;
