import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireIT, requireReportAccess } from '../middleware/permissions';
import { generateMembersReport, previewMembersReport } from '../controllers/reports/members.report';
import { generateAgreementsReport, previewAgreementsReport } from '../controllers/reports/agreements.report';
import { getReportAccess, grantReportAccess, revokeReportAccess } from '../controllers/reports/access.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/members/preview',    requireReportAccess('MEMBER_REPORT'),    previewMembersReport);
router.get('/members',            requireReportAccess('MEMBER_REPORT'),    generateMembersReport);
router.get('/agreements/preview', requireReportAccess('AGREEMENT_REPORT'), previewAgreementsReport);
router.get('/agreements',         requireReportAccess('AGREEMENT_REPORT'), generateAgreementsReport);

router.get('/access/:userId',                  requireIT, getReportAccess);
router.post('/access/:userId/:reportKey',      requireIT, grantReportAccess);
router.delete('/access/:userId/:reportKey',    requireIT, revokeReportAccess);

export default router;
