import { StaffRole } from '@/generated/prisma/enums';

export const STAFF_ROLE_ORDER: readonly StaffRole[] = [StaffRole.staff, StaffRole.manager, StaffRole.owner];

export function meetsMinimumStaffRole(role: StaffRole, minRole: StaffRole): boolean {
  return STAFF_ROLE_ORDER.indexOf(role) >= STAFF_ROLE_ORDER.indexOf(minRole);
}

export const ACCOUNT_LOCK_THRESHOLD = 5;
export const ACCOUNT_LOCK_MINUTES = 15;
