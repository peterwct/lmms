import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireResortsReferenceRead, requireResortsSetupAccess } from '../middleware/permissions';
import * as ctrl from '../controllers/products.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// SHARED REFERENCE READ, declared BEFORE the grant guard below so the guard does not apply to it.
// RCI fn 1 (useActiveProducts) reads this for its product filter and form dropdown. Same rule as
// resorts.ts -- keep the two in step.
router.get('/', requireResortsReferenceRead(), ctrl.listProducts);

// Everything below is Resorts Setup fn 1 proper: granted per user, all-or-nothing.
router.use(requireResortsSetupAccess);

router.post('/',            ctrl.createProduct);
router.put('/:id',          ctrl.updateProduct);
router.patch('/:id/toggle', ctrl.toggleProductStatus);
router.delete('/:id',       ctrl.deleteProduct);

export default router;
