import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/products.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',       requirePermission('RESORTS_SETUP', 'view'),   ctrl.listProducts);
router.post('/',      requirePermission('RESORTS_SETUP', 'create'), ctrl.createProduct);
router.put('/:id',    requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateProduct);
router.delete('/:id', requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteProduct);

export default router;
