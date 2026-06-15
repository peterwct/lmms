import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireIT, requireReportAccess } from '../middleware/permissions';
import { generateMembersReport, previewMembersReport } from '../controllers/reports/members.report';
import { generateAgreementsReport, previewAgreementsReport } from '../controllers/reports/agreements.report';
import { previewExpiryReport, generateExpiryReport } from '../controllers/reports/expiry.report';
import { previewExpiringMembersReport, generateExpiringMembersReport } from '../controllers/reports/expiring-members.report';
import { previewRemainingValueReport, generateRemainingValueReport } from '../controllers/reports/remaining-value.report';
import { previewExpirySummaryReport, generateExpirySummaryReport } from '../controllers/reports/expiry-summary.report';
import { getReportAccess, grantReportAccess, revokeReportAccess } from '../controllers/reports/access.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/members/preview',    requireReportAccess('MEMBER_REPORT'),    previewMembersReport);
router.get('/members',            requireReportAccess('MEMBER_REPORT'),    generateMembersReport);
router.get('/agreements/preview', requireReportAccess('AGREEMENT_REPORT'), previewAgreementsReport);
router.get('/agreements',         requireReportAccess('AGREEMENT_REPORT'), generateAgreementsReport);
router.get('/expiry/preview',              requireReportAccess('EXPIRY_REPORT'),            previewExpiryReport);
router.get('/expiry',                     requireReportAccess('EXPIRY_REPORT'),            generateExpiryReport);
router.get('/expiring-members/preview',   requireReportAccess('EXPIRING_MEMBER_REPORT'),  previewExpiringMembersReport);
router.get('/expiring-members',           requireReportAccess('EXPIRING_MEMBER_REPORT'),  generateExpiringMembersReport);
router.get('/remaining-value/preview',    requireReportAccess('REMAINING_VALUE_REPORT'),   previewRemainingValueReport);
router.get('/remaining-value',            requireReportAccess('REMAINING_VALUE_REPORT'),   generateRemainingValueReport);
router.get('/expiry-summary/preview',     requireReportAccess('EXPIRY_SUMMARY_REPORT'),    previewExpirySummaryReport);
router.get('/expiry-summary',             requireReportAccess('EXPIRY_SUMMARY_REPORT'),    generateExpirySummaryReport);

router.get('/access/:userId',                  requireIT, getReportAccess);
router.post('/access/:userId/:reportKey',      requireIT, grantReportAccess);
router.delete('/access/:userId/:reportKey',    requireIT, revokeReportAccess);

export default router;
