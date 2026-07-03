import type { StaffRole } from '@/generated/prisma/enums';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthenticatedStaff {
  id: string;
  email: string;
  role: StaffRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      staff?: AuthenticatedStaff;
    }
  }
}

export {};
