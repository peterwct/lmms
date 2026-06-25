import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission, requireReportAccess } from '../middleware/permissions';
import * as ctrl from '../controllers/pbs.controller';
import * as payByMonth from '../controllers/reports/pbs-pay-by-month.report';
import * as claimReport from '../controllers/reports/pbs-claim.report';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/reports/pay-by-month/preview', requireReportAccess('PBS_PAY_BY_MONTH_REPORT'), payByMonth.previewPbsPayByMonth);
router.get('/reports/pay-by-month',         requireReportAccess('PBS_PAY_BY_MONTH_REPORT'), payByMonth.generatePbsPayByMonth);
router.get('/reports/claim/preview',        requireReportAccess('PBS_CLAIM_REPORT'),         claimReport.previewPbsClaimReport);
router.get('/reports/claim',                requireReportAccess('PBS_CLAIM_REPORT'),         claimReport.generatePbsClaimReport);

router.get('/',                       requirePermission('PBS_SCHEME', 'view'),   ctrl.listPbsSchemes);
router.get('/:id',                    requirePermission('PBS_SCHEME', 'view'),   ctrl.getPbsScheme);
router.put('/:id',                    requirePermission('PBS_SCHEME', 'edit'),   ctrl.updatePbsScheme);
router.post('/:id/claims',            requirePermission('PBS_SCHEME', 'create'), ctrl.createClaim);
router.put('/:id/claims/:claimId',    requirePermission('PBS_SCHEME', 'edit'),   ctrl.updateClaim);
router.delete('/:id/claims/:claimId', requirePermission('PBS_SCHEME', 'delete'), ctrl.deleteClaim);

export default router;
