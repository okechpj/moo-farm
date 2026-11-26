import { PermissionKey } from '../config/permissions';
import { AccountType, RoleCode } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  accountType: AccountType;
  preferredLocale: string;
  tokenVersion: number;
}

export interface FarmRequestContext {
  farmId: string;
  membershipId: string;
  roleCode: RoleCode;
  roleName: string;
  permissions: Set<PermissionKey>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      farmContext?: FarmRequestContext;
    }
  }
}

export {};
