import dotenv from 'dotenv';
import path from 'path';
// Load the project-root .env regardless of cwd (the backend starts in backend/,
// where there is no .env). override:true so the file is authoritative and a stale
// shell DATABASE_URL can't silently take over. Must run before any other imports
// that read process.env.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import authRoutes        from './routes/auth';
import userRoutes        from './routes/users';
import departmentRoutes  from './routes/departments';
import auditRoutes       from './routes/audit';
import memberRoutes      from './routes/members';
import agreementRoutes   from './routes/agreements';
import amcScheduleRoutes from './routes/amc/schedules';
import amcInvoiceRoutes  from './routes/amc/invoices';
import amcRateRoutes     from './routes/amc/rates';
import amcDayendRoutes   from './routes/amc/dayend';
import stateRoutes       from './routes/states';
import reportsRoutes     from './routes/reports';
import pbsRoutes         from './routes/pbs';
import cancellationReasonRoutes from './routes/cancellationReasons';
import suReasonRoutes    from './routes/suReasons';
import resortRoutes      from './routes/resorts';

// Member-scoped sub-routes
import { authenticate, requirePasswordChanged } from './middleware/auth';
import { requirePermission }                    from './middleware/permissions';
import { getScheduleByAgreement }               from './controllers/amc/schedules.controller';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',              authRoutes);
app.use('/api/users',             userRoutes);
app.use('/api/departments',       departmentRoutes);
app.use('/api/audit',             auditRoutes);
app.use('/api/members',           memberRoutes);
app.use('/api/agreements',        agreementRoutes);
app.use('/api/amc/schedules',     amcScheduleRoutes);
app.use('/api/amc/invoices',      amcInvoiceRoutes);
app.use('/api/amc/rates',         amcRateRoutes);
app.use('/api/amc/dayend',        amcDayendRoutes);
app.use('/api/states',            stateRoutes);
app.use('/api/reports',           reportsRoutes);
app.use('/api/pbs',              pbsRoutes);
app.use('/api/cancellation-reasons', cancellationReasonRoutes);
app.use('/api/su-reasons',        suReasonRoutes);
app.use('/api/resorts',           resortRoutes);

// ─── Member-scoped agreement + AMC routes ─────────────────────────────────────
app.get(
  '/api/members/:memberId/agreements',
  authenticate, requirePasswordChanged,
  requirePermission('AGREEMENTS', 'view'),
  async (req: Request, res: Response) => {
    const { memberId } = req.params;
    const agreements = await (await import('./utils/prisma')).prisma.agreement.findMany({
      where: { memberId },
      include: { nominees: true, amcSchedule: true },
      orderBy: { agreementDate: 'desc' },
    });
    res.json({ data: agreements });
  }
);

app.get(
  '/api/agreements/:id/amc',
  authenticate, requirePasswordChanged,
  requirePermission('AMC_BILLING', 'view'),
  getScheduleByAgreement
);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── Root info page ───────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LHB MMS API</title>
  <style>
    body { font-family: monospace; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1   { color: #38bdf8; }
    h2   { color: #94a3b8; margin-top: 2rem; }
    a    { color: #38bdf8; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: .4rem .8rem; border-bottom: 1px solid #1e293b; }
    th { color: #94a3b8; font-size: .85rem; }
    .badge { display:inline-block; padding:.1rem .5rem; border-radius:4px; font-size:.8rem; }
    .get  { background:#166534; color:#bbf7d0; }
    .post { background:#1e3a5f; color:#bae6fd; }
    .put  { background:#78350f; color:#fde68a; }
    .patch{ background:#4c1d95; color:#ddd6fe; }
  </style>
</head>
<body>
  <h1>LHB Member Management System — API</h1>
  <p>Backend running on port ${process.env.PORT ?? 3001} &nbsp;|&nbsp; <a href="/api/health">/api/health</a></p>

  <h2>Auth</h2>
  <table>
    <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/auth/login</td><td>Login → JWT cookie</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/auth/logout</td><td>Clear JWT cookie</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/auth/change-password</td><td>Change password</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/auth/me</td><td>Current user + permissions</td></tr>
  </table>

  <h2>Admin — Users</h2>
  <table>
    <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/users</td><td>List users</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/users</td><td>Create user</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/users/:id</td><td>Get user</td></tr>
    <tr><td><span class="badge put">PUT</span></td><td>/api/users/:id</td><td>Update user</td></tr>
    <tr><td><span class="badge patch">PATCH</span></td><td>/api/users/:id/suspend</td><td>Suspend / reactivate</td></tr>
    <tr><td><span class="badge patch">PATCH</span></td><td>/api/users/:id/reset-password</td><td>IT: reset password</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/users/:id/clone</td><td>Clone user</td></tr>
  </table>

  <h2>Admin — Departments</h2>
  <table>
    <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/departments</td><td>List departments</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/departments</td><td>Create department</td></tr>
    <tr><td><span class="badge put">PUT</span></td><td>/api/departments/:id</td><td>Update department</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/departments/:id/permissions</td><td>Get permissions</td></tr>
    <tr><td><span class="badge put">PUT</span></td><td>/api/departments/:id/permissions</td><td>IT: update permissions</td></tr>
  </table>

  <h2>Members &amp; Agreements</h2>
  <table>
    <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/members</td><td>Search members</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/members</td><td>Create member</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/members/:id</td><td>Member detail + agreements</td></tr>
    <tr><td><span class="badge put">PUT</span></td><td>/api/members/:id</td><td>Update member</td></tr>
    <tr><td><span class="badge patch">PATCH</span></td><td>/api/members/:id/status</td><td>Change member status</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/members/:id/agreements</td><td>Member agreements</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/agreements</td><td>List agreements</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/agreements/:id</td><td>Agreement detail</td></tr>
    <tr><td><span class="badge put">PUT</span></td><td>/api/agreements/:id</td><td>Update agreement</td></tr>
    <tr><td><span class="badge patch">PATCH</span></td><td>/api/agreements/:id/status</td><td>Change agreement status</td></tr>
    <tr><td><span class="badge put">PUT</span></td><td>/api/agreements/:id/nominees</td><td>Update nominees</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/agreements/:id/amc</td><td>AMC schedule for agreement</td></tr>
  </table>

  <h2>AMC Billing</h2>
  <table>
    <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/amc/schedules</td><td>Billing schedules</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/amc/schedules/:id</td><td>Schedule detail</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/amc/invoices</td><td>List invoices</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/amc/invoices/generate</td><td>Credit/IT: generate invoices</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/amc/invoices/:id</td><td>Invoice detail</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/amc/invoices/:id/download</td><td>Download PDF</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/amc/rates/lhc</td><td>LHC rate master</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/amc/rates/lhc</td><td>Finance/IT: add LHC rate</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/amc/rates/cp</td><td>CP points rate master</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/amc/rates/cp</td><td>Finance/IT: add CP rate tier</td></tr>
    <tr><td><span class="badge post">POST</span></td><td>/api/amc/dayend/generate</td><td>Credit/IT: generate day-end files</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/amc/dayend/history</td><td>Day-end file history</td></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/amc/dayend/download/:filename</td><td>Download day-end file</td></tr>
  </table>

  <h2>Audit</h2>
  <table>
    <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
    <tr><td><span class="badge get">GET</span></td><td>/api/audit</td><td>IT only: audit log</td></tr>
  </table>
</body>
</html>`);
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(process.env.PORT ?? '3001', 10);
app.listen(PORT, () => {
  console.log(`LHB MMS backend running on http://localhost:${PORT}`);
});

export default app;
