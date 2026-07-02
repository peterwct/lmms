import type { User, AgreementStatus } from '../types';

// Frontend mirror of the backend department-based authority rules for agreements.
// Keep in sync with statusChangeAllowed() in backend agreements.controller.ts and
// requireITorMemberServices in backend permissions.ts.

const isIT = (u: User | null) => u?.department.isLocked ?? false;
const deptName = (u: User | null) => u?.department.name;

// Which new statuses this user may pick, given the record's current status.
// IT + Finance: any status, any direction. Credit: NA/SU/PT but never TM, and
// nothing at all once the record is TM. Everyone else (incl. Member Services): none.
export function allowedNewStatuses(u: User | null, current: AgreementStatus): AgreementStatus[] {
  if (isIT(u) || deptName(u) === 'Finance') return ['NA', 'SU', 'PT', 'TM'];
  if (deptName(u) === 'Credit') return current === 'TM' ? [] : ['NA', 'SU', 'PT'];
  return [];
}

// Nominees and RCI info are editable by Member Services only (plus IT).
export const canEditNomineesRci = (u: User | null): boolean =>
  isIT(u) || deptName(u) === 'Member Services';
