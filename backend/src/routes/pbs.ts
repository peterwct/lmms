import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission, requireReportAccess } from '../middleware/permissions';
import * as ctrl from '../controllers/pbs.controller';
import * as payByMonth from '../controllers/reports/pbs-pay-by-month.report';
import * as claimReport from '../controllers/reports/pbs-claim.report';
import * as notInPbs from '../controllers/reports/pbs-not-in-pbs.report';
import * as varianceReport from '../controllers/reports/pbs-variance.report';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/reports/pay-by-month/preview', requireReportAccess('PBS_PAY_BY_MONTH_REPORT'), payByMonth.previewPbsPayByMonth);
router.get('/reports/pay-by-month',         requireReportAccess('PBS_PAY_BY_MONTH_REPORT'), payByMonth.generatePbsPayByMonth);
router.get('/reports/claim/preview',        requireReportAccess('PBS_CLAIM_REPORT'),         claimReport.previewPbsClaimReport);
router.get('/reports/claim',                requireReportAccess('PBS_CLAIM_REPORT'),         claimReport.generatePbsClaimReport);
router.get('/reports/not-in-pbs/preview',   requireReportAccess('PBS_NOT_IN_PBS_REPORT'),    notInPbs.previewNotInPbs);
router.get('/reports/not-in-pbs',           requireReportAccess('PBS_NOT_IN_PBS_REPORT'),    notInPbs.generateNotInPbs);
router.get('/reports/variance/preview',     requireReportAccess('PBS_VARIANCE_REPORT'),      varianceReport.previewPbsVariance);
router.get('/reports/variance',             requireReportAccess('PBS_VARIANCE_REPORT'),      varianceReport.generatePbsVariance);

router.get('/',                       requirePermission('PBS_SCHEME', 'view'),   ctrl.listPbsSchemes);
router.get('/:id',                    requirePermission('PBS_SCHEME', 'view'),   ctrl.getPbsScheme);
router.put('/:id',                    requirePermission('PBS_SCHEME', 'edit'),   ctrl.updatePbsScheme);
router.post('/:id/claims',            requirePermission('PBS_SCHEME', 'create'), ctrl.createClaim);
router.put('/:id/claims/:claimId',    requirePermission('PBS_SCHEME', 'edit'),   ctrl.updateClaim);
router.delete('/:id/claims/:claimId', requirePermission('PBS_SCHEME', 'delete'), ctrl.deleteClaim);

export default router;
