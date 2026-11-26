import { NextFunction, Request, Response } from 'express';
import { AccountType, MembershipStatus, PermissionEffect } from '@prisma/client';
import { prisma } from '../config/prisma';
import { PermissionKey } from '../config/permissions';
import { Errors } from '../utils/errors';
import { verifyAccessToken } from '../utils/tokens';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveEffectivePermissions(
  rolePermissionKeys: string[],
  overrides: { permission: { key: string }; effect: PermissionEffect }[],
): Set<PermissionKey> {
  const effective = new Set<PermissionKey>(rolePermissionKeys as PermissionKey[]);
  for (const override of overrides) {
    const key = override.permission.key as PermissionKey;
    if (override.effect === PermissionEffect.ALLOW) {
      effective.add(key);
    } else {
      effective.delete(key);
    }
  }
  return effective;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw Errors.unauthorized('Missing or invalid authorization token');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw Errors.unauthorized('Missing authorization token');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw Errors.unauthorized('Your session has expired. Please log in again.');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        phone: true,
        email: true,
        fullName: true,
        accountType: true,
        preferredLocale: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      throw Errors.unauthorized('Your session is no longer valid. Please log in again.');
    }

    req.user = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      accountType: user.accountType,
      preferredLocale: user.preferredLocale,
      tokenVersion: user.tokenVersion,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireOwnerAccount(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    return next(Errors.unauthorized());
  }
  if (req.user.accountType !== AccountType.OWNER) {
    return next(Errors.forbidden('Only farm owner accounts can perform this action.'));
  }
  next();
}

export async function requireFarmMembership(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw Errors.unauthorized();
    }

    const rawFarmId = req.params.farmId;
    const farmId = Array.isArray(rawFarmId) ? rawFarmId[0] : rawFarmId;
    if (!farmId || !UUID_REGEX.test(farmId)) {
      throw Errors.badRequest('Invalid farm identifier');
    }

    const membership = await prisma.farmMembership.findUnique({
      where: {
        farmId_userId: {
          farmId,
          userId: req.user.id,
        },
      },
      include: {
        farm: {
          select: { id: true, archivedAt: true },
        },
        role: {
          include: {
            rolePermissions: {
              include: { permission: { select: { key: true } } },
            },
          },
        },
        permissionOverrides: {
          include: { permission: { select: { key: true } } },
        },
      },
    });

    if (!membership || membership.status !== MembershipStatus.ACTIVE || membership.farm.archivedAt) {
      throw Errors.forbidden('You do not have access to this farm.');
    }

    const baseKeys = membership.role.rolePermissions.map((rp) => rp.permission.key);
    const effective = resolveEffectivePermissions(baseKeys, membership.permissionOverrides);

    req.farmContext = {
      farmId: membership.farmId,
      membershipId: membership.id,
      roleCode: membership.role.code,
      roleName: membership.role.name,
      permissions: effective,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(...requiredPermissions: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.farmContext) {
      return next(Errors.forbidden('Farm membership context is required.'));
    }

    const missing = requiredPermissions.filter(
      (perm) => !req.farmContext!.permissions.has(perm),
    );

    if (missing.length > 0) {
      return next(
        Errors.forbidden('You do not have permission to perform this action.'),
      );
    }

    next();
  };
}
