import { PrismaClient, AppModule } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ─── Permission helpers ────────────────────────────────────────────────────────

type PermSet = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const FULL: PermSet  = { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  };
const VIEW_EDIT: PermSet = { canView: true,  canCreate: false, canEdit: true,  canDelete: false };
const VIEW: PermSet  = { canView: true,  canCreate: false, canEdit: false, canDelete: false };
const NONE: PermSet  = { canView: false, canCreate: false, canEdit: false, canDelete: false };

type DeptPermMatrix = Record<AppModule, PermSet>;

const PERMISSION_MATRIX: Record<string, DeptPermMatrix> = {
  IT: {
    ADMIN:          FULL,
    MEMBERS:        FULL,
    AGREEMENTS:     FULL,
    AMC_BILLING:    FULL,
    RESORT_BOOKING: FULL,
    ENTITLEMENTS:   FULL,
    PBS_SCHEME:     FULL,
  },
  Finance: {
    ADMIN:          NONE,
    MEMBERS:        VIEW,
    AGREEMENTS:     VIEW,
    AMC_BILLING:    FULL,
    RESORT_BOOKING: NONE,
    ENTITLEMENTS:   VIEW,
    PBS_SCHEME:     VIEW,
  },
  Credit: {
    ADMIN:          NONE,
    MEMBERS:        VIEW,
    AGREEMENTS:     VIEW_EDIT,
    AMC_BILLING:    FULL,
    RESORT_BOOKING: NONE,
    ENTITLEMENTS:   VIEW,
    PBS_SCHEME:     VIEW,
  },
  'Member Services': {
    ADMIN:          NONE,
    MEMBERS:        FULL,
    AGREEMENTS:     FULL,
    AMC_BILLING:    VIEW,
    RESORT_BOOKING: FULL,
    ENTITLEMENTS:   FULL,
    PBS_SCHEME:     VIEW,
  },
  'Resort Operations': {
    ADMIN:          NONE,
    MEMBERS:        VIEW,
    AGREEMENTS:     VIEW,
    AMC_BILLING:    NONE,
    RESORT_BOOKING: FULL,
    ENTITLEMENTS:   VIEW_EDIT,
    PBS_SCHEME:     VIEW,
  },
};

// ─── Departments ──────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  { name: 'IT',               description: 'Full system access',                           isLocked: true  },
  { name: 'Finance',          description: 'Manages AMC billing and payment records',       isLocked: false },
  { name: 'Credit',           description: 'Handles agreements and AMC billing',            isLocked: false },
  { name: 'Member Services',  description: 'Manages members, agreements and bookings',      isLocked: false },
  { name: 'Resort Operations',description: 'Manages resort bookings and entitlements',      isLocked: false },
];

// ─── AMC Rate Masters — LHC (coCode 03 + 15) ─────────────────────────────────

const AMC_PRICES = [
  // coCode 03 — Effective 2024-01-01
  {
    coCode: '03', effectiveDate: new Date('2024-01-01'),
    priceCode: 'M', currencyCode: 'RM',
    amcAmount: 1200.00, sinkingFund: 120.00, serviceTax: 96.00, totalAmount: 1416.00,
    amountInWords: 'Ringgit Malaysia One Thousand Four Hundred Sixteen Only',
    rate: 1.0000,
  },
  {
    coCode: '03', effectiveDate: new Date('2024-01-01'),
    priceCode: 'S', currencyCode: 'S$',
    amcAmount: 1200.00, sinkingFund: 120.00, serviceTax: 96.00, totalAmount: 1416.00,
    amountInWords: 'Singapore Dollar One Thousand Four Hundred Sixteen Only',
    rate: 3.3000,
  },
  // coCode 15 — Effective 2024-01-01
  {
    coCode: '15', effectiveDate: new Date('2024-01-01'),
    priceCode: 'M', currencyCode: 'RM',
    amcAmount: 980.00, sinkingFund: 98.00, serviceTax: 78.40, totalAmount: 1156.40,
    amountInWords: 'Ringgit Malaysia One Thousand One Hundred Fifty Six and Cents Forty Only',
    rate: 1.0000,
  },
  {
    coCode: '15', effectiveDate: new Date('2024-01-01'),
    priceCode: 'S', currencyCode: 'S$',
    amcAmount: 980.00, sinkingFund: 98.00, serviceTax: 78.40, totalAmount: 1156.40,
    amountInWords: 'Singapore Dollar One Thousand One Hundred Fifty Six and Cents Forty Only',
    rate: 3.3000,
  },
];

// ─── AMC Rate Masters — CP (coCode 02) ───────────────────────────────────────
// Points tiers with rate per point, sinking fund %, and GST/service tax %

const AMC_PRICE_POINTS = [
  { coCode: '02', effectiveDate: new Date('2024-01-01'), minPoints: 60,  maxPoints: 124,  amcRatePerPoint: 2.56, sinkingFundPct: 10, gstPct: 8 },
  { coCode: '02', effectiveDate: new Date('2024-01-01'), minPoints: 125, maxPoints: 249,  amcRatePerPoint: 2.48, sinkingFundPct: 10, gstPct: 8 },
  { coCode: '02', effectiveDate: new Date('2024-01-01'), minPoints: 250, maxPoints: 499,  amcRatePerPoint: 2.40, sinkingFundPct: 10, gstPct: 8 },
  { coCode: '02', effectiveDate: new Date('2024-01-01'), minPoints: 500, maxPoints: 749,  amcRatePerPoint: 2.32, sinkingFundPct: 10, gstPct: 8 },
  { coCode: '02', effectiveDate: new Date('2024-01-01'), minPoints: 750, maxPoints: 9999, amcRatePerPoint: 2.24, sinkingFundPct: 10, gstPct: 8 },
];

// ─── Main seed ────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding database...');

  // 1. Departments
  console.log('  → Departments');
  const deptMap: Record<string, number> = {};
  for (const dept of DEPARTMENTS) {
    const created = await prisma.department.upsert({
      where: { name: dept.name },
      update: { description: dept.description, isLocked: dept.isLocked },
      create: dept,
    });
    deptMap[dept.name] = created.id;
  }

  // 2. Department permissions
  console.log('  → Department permissions');
  for (const [deptName, modules] of Object.entries(PERMISSION_MATRIX)) {
    const deptId = deptMap[deptName];
    if (!deptId) continue;

    for (const [module, perms] of Object.entries(modules) as [AppModule, PermSet][]) {
      await prisma.deptModulePermission.upsert({
        where: { departmentId_module: { departmentId: deptId, module } },
        update: perms,
        create: { departmentId: deptId, module, ...perms },
      });
    }
  }

  // 3. Default admin user
  console.log('  → Admin user');
  const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  const passwordHash = await bcrypt.hash('LHB@Admin2026!', BCRYPT_ROUNDS);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      fullName:      'System Administrator',
      username:      'admin',
      email:         'admin@leisureholidays.com.my',
      passwordHash,
      mustChangePwd: false,
      departmentId:  deptMap['IT'],
      updatedAt:     new Date(),
    },
  });

  // 4. Cancellation reasons are seeded from the authoritative Informix export
  //    (migrate/agmt_can_cate.txt) via prisma/seed-cancellation-reasons.ts.
  //    Do not seed them here — a hardcoded list would overwrite the real
  //    descriptions on upsert-by-code (last writer wins).

  // 5. AMC price master — LHC
  console.log('  → AMC price master (LHC)');
  for (const price of AMC_PRICES) {
    await prisma.amcPrice.upsert({
      where: {
        coCode_priceCode_effectiveDate: {
          coCode: price.coCode,
          priceCode: price.priceCode,
          effectiveDate: price.effectiveDate,
        },
      },
      update: {
        amcAmount:    price.amcAmount,
        sinkingFund:  price.sinkingFund,
        serviceTax:   price.serviceTax,
        totalAmount:  price.totalAmount,
        amountInWords: price.amountInWords,
        rate:         price.rate,
        currencyCode: price.currencyCode,
      },
      create: { id: randomUUID(), updatedAt: new Date(), ...price },
    });
  }

  // 6. AMC price master — CP points tiers
  console.log('  → AMC price master (CP points tiers)');
  for (const tier of AMC_PRICE_POINTS) {
    await prisma.amcPricePoints.upsert({
      where: {
        coCode_minPoints_maxPoints_effectiveDate: {
          coCode:        tier.coCode,
          minPoints:     tier.minPoints,
          maxPoints:     tier.maxPoints,
          effectiveDate: tier.effectiveDate,
        },
      },
      update: {
        amcRatePerPoint: tier.amcRatePerPoint,
        sinkingFundPct:  tier.sinkingFundPct,
        gstPct:          tier.gstPct,
      },
      create: { id: randomUUID(), updatedAt: new Date(), ...tier },
    });
  }

  console.log('Seed complete.');
  console.log('');
  console.log('Default login:');
  console.log('  username : admin');
  console.log('  password : LHB@Admin2026!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
