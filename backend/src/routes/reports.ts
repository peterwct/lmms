import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { generateMembersReport, previewMembersReport } from '../controllers/reports/members.report';
import { generateAgreementsReport, previewAgreementsReport } from '../controllers/reports/agreements.report';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/members/preview',    requirePermission('MEMBERS',    'view'), previewMembersReport);
router.get('/members',            requirePermission('MEMBERS',    'view'), generateMembersReport);
router.get('/agreements/preview', requirePermission('AGREEMENTS', 'view'), previewAgreementsReport);
router.get('/agreements',         requirePermission('AGREEMENTS', 'view'), generateAgreementsReport);

export default router;
