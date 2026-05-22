import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../controllers/auth.controller';

const router = Router();

router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);
router.post('/change-password', authenticate, ctrl.changePassword);
router.get('/me', authenticate, ctrl.me);

export default router;
