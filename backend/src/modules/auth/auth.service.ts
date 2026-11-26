import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AccountType, MembershipStatus, PermissionEffect, Prisma, RoleCode } from '@prisma/client';
import { Request, Response } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import {
  ASSISTANT_CONFIGURABLE_PERMISSION_KEYS,
  PERMISSIONS,
  PermissionKey,
} from '../../config/permissions';
import { resolveEffectivePermissions } from '../../middleware/auth';
import { recordAuditLog } from '../../utils/audit';
import { Errors } from '../../utils/errors';
import { isLikelyEmail, normalizePhoneNumber } from '../../utils/phone';
import {
  generateOpaqueToken,
  normalizeInviteCode,
  sha256Hash,
  signAccessToken,
} from '../../utils/tokens';

const BCRYPT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 12;
export const REFRESH_COOKIE_NAME = 'moo_refresh_token';

export function setRefreshTokenCookie(res: Response, rawToken: string): void {
  const maxAgeMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: maxAgeMs,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
  });
}

export async function getUserMembershipsPayload(userId: string) {
  const memberships = await prisma.farmMembership.findMany({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
      farm: { archivedAt: null },
    },
    include: {
      farm: {
        select: {
          id: true,
          name: true,
          location: true,
          timezone: true,
          currency: true,
          milkDropAlertThresholdPct: true,
          milkDropBaselineDays: true,
        },
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
    orderBy: { joinedAt: 'asc' },
  });

  return memberships.map((m) => {
    const baseKeys = m.role.rolePermissions.map((rp) => rp.permission.key);
    const effective = Array.from(
      resolveEffectivePermissions(baseKeys, m.permissionOverrides),
    ).sort();

    return {
      membershipId: m.id,
      farmId: m.farm.id,
      farm: {
        ...m.farm,
        milkDropAlertThresholdPct: Number(m.farm.milkDropAlertThresholdPct),
      },
      role: {
        code: m.role.code,
        name: m.role.name,
      },
      permissions: effective,
      joinedAt: m.joinedAt,
    };
  });
}

async function issueSessionTokens(
  userId: string,
  tokenVersion: number,
  deviceLabel?: string,
  existingFamilyId?: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const accessToken = signAccessToken(userId, tokenVersion);
  const rawRefreshToken = generateOpaqueToken(48);
  const tokenHash = sha256Hash(rawRefreshToken);
  const familyId = existingFamilyId ?? crypto.randomUUID();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await tx.refreshToken.create({
    data: {
      userId,
      tokenHash,
      familyId,
      deviceLabel: deviceLabel ?? null,
      expiresAt,
    },
  });

  return { accessToken, rawRefreshToken };
}

export async function registerOwner(
  input: {
    fullName: string;
    phone: string;
    email?: string;
    password: string;
    farmName?: string;
    farmLocation?: string;
  },
  req: Request,
) {
  const normalizedPhone = normalizePhoneNumber(input.phone);
  const normalizedEmail = input.email?.trim() ? input.email.trim().toLowerCase() : null;

  const existingPhone = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  if (existingPhone) {
    throw Errors.conflict('An account with this phone number already exists.');
  }

  if (normalizedEmail) {
    const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingEmail) {
      throw Errors.conflict('An account with this email address already exists.');
    }
  }

  const ownerRole = await prisma.role.findUnique({ where: { code: RoleCode.FARM_OWNER } });
  if (!ownerRole) {
    throw new Error('System roles are not seeded. Run prisma:seed first.');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        fullName: input.fullName.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        passwordHash,
        accountType: AccountType.OWNER,
        lastLoginAt: new Date(),
      },
    });

    let createdFarmId: string | null = null;
    if (input.farmName && input.farmName.trim().length > 0) {
      const farm = await tx.farm.create({
        data: {
          name: input.farmName.trim(),
          location: input.farmLocation?.trim() || null,
          createdById: user.id,
        },
      });
      createdFarmId = farm.id;

      await tx.farmMembership.create({
        data: {
          farmId: farm.id,
          userId: user.id,
          roleId: ownerRole.id,
          status: MembershipStatus.ACTIVE,
        },
      });

      await recordAuditLog(
        {
          farmId: farm.id,
          actorUserId: user.id,
          action: 'farm.created',
          entityType: 'Farm',
          entityId: farm.id,
          afterData: { name: farm.name, location: farm.location },
          req,
        },
        tx,
      );
    }

    await recordAuditLog(
      {
        farmId: createdFarmId,
        actorUserId: user.id,
        action: 'auth.registered',
        entityType: 'User',
        entityId: user.id,
        afterData: { phone: user.phone, email: user.email, accountType: user.accountType },
        req,
      },
      tx,
    );

    const tokens = await issueSessionTokens(user.id, user.tokenVersion, undefined, undefined, tx);
    return { user, tokens };
  });

  const memberships = await getUserMembershipsPayload(result.user.id);

  return {
    accessToken: result.tokens.accessToken,
    rawRefreshToken: result.tokens.rawRefreshToken,
    user: {
      id: result.user.id,
      fullName: result.user.fullName,
      phone: result.user.phone,
      email: result.user.email,
      accountType: result.user.accountType,
      preferredLocale: result.user.preferredLocale,
    },
    memberships,
  };
}

export async function loginUser(
  input: { identifier: string; password: string; deviceLabel?: string },
  req: Request,
) {
  let user;
  if (isLikelyEmail(input.identifier)) {
    const email = input.identifier.trim().toLowerCase();
    user = await prisma.user.findUnique({ where: { email } });
  } else {
    const phone = normalizePhoneNumber(input.identifier);
    user = await prisma.user.findUnique({ where: { phone } });
  }

  if (!user || !user.isActive) {
    throw Errors.unauthorized('Incorrect phone number/email or password.');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw Errors.unauthorized('Incorrect phone number/email or password.');
  }

  const tokens = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await recordAuditLog(
      {
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'User',
        entityId: user.id,
        req,
      },
      tx,
    );

    return issueSessionTokens(user.id, user.tokenVersion, input.deviceLabel, undefined, tx);
  });

  const memberships = await getUserMembershipsPayload(user.id);

  return {
    accessToken: tokens.accessToken,
    rawRefreshToken: tokens.rawRefreshToken,
    user: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      accountType: user.accountType,
      preferredLocale: user.preferredLocale,
    },
    memberships,
  };
}

export async function refreshSession(rawRefreshToken: string | undefined) {
  if (!rawRefreshToken) {
    throw Errors.unauthorized('No refresh session found. Please log in again.');
  }

  const tokenHash = sha256Hash(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) {
    throw Errors.unauthorized('Invalid session. Please log in again.');
  }

  // Refresh token reuse detection: if already revoked, invalidate the entire family
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw Errors.unauthorized('Session reuse detected. Please log in again.');
  }

  if (stored.expiresAt < new Date() || !stored.user.isActive) {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    throw Errors.unauthorized('Your session has expired. Please log in again.');
  }

  const tokens = await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return issueSessionTokens(
      stored.user.id,
      stored.user.tokenVersion,
      stored.deviceLabel ?? undefined,
      stored.familyId,
      tx,
    );
  });

  const memberships = await getUserMembershipsPayload(stored.user.id);

  return {
    accessToken: tokens.accessToken,
    rawRefreshToken: tokens.rawRefreshToken,
    user: {
      id: stored.user.id,
      fullName: stored.user.fullName,
      phone: stored.user.phone,
      email: stored.user.email,
      accountType: stored.user.accountType,
      preferredLocale: stored.user.preferredLocale,
    },
    memberships,
  };
}

export async function logoutSession(rawRefreshToken: string | undefined, userId?: string, req?: Request) {
  if (rawRefreshToken) {
    const tokenHash = sha256Hash(rawRefreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  if (userId) {
    await recordAuditLog({
      actorUserId: userId,
      action: 'auth.logout',
      entityType: 'User',
      entityId: userId,
      req,
    });
  }
}

export async function acceptAssistantInvitation(
  input: {
    phone: string;
    inviteCode: string;
    fullName: string;
    password: string;
    deviceLabel?: string;
  },
  req: Request,
) {
  const normalizedPhone = normalizePhoneNumber(input.phone);
  const normalizedCode = normalizeInviteCode(input.inviteCode);
  const codeHash = sha256Hash(normalizedCode);

  const invitation = await prisma.farmInvitation.findUnique({
    where: { codeHash },
    include: {
      farm: { select: { id: true, name: true, archivedAt: true } },
      role: true,
    },
  });

  if (
    !invitation ||
    invitation.phone !== normalizedPhone ||
    invitation.revokedAt !== null ||
    invitation.acceptedAt !== null ||
    invitation.expiresAt < new Date() ||
    invitation.farm.archivedAt !== null
  ) {
    throw Errors.badRequest(
      'This invitation code is invalid, expired, or does not match your phone number.',
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  if (existingUser) {
    const valid = await bcrypt.compare(input.password, existingUser.passwordHash);
    if (!valid) {
      throw Errors.unauthorized(
        'An account already exists for this phone number. Enter your existing password to accept this invitation.',
      );
    }
  }

  const passwordHash = existingUser ? null : await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const configurableSet = new Set<string>(ASSISTANT_CONFIGURABLE_PERMISSION_KEYS);
  const requestedGrants = Array.isArray(invitation.grantedPermissions)
    ? (invitation.grantedPermissions as unknown[]).filter(
        (k): k is PermissionKey => typeof k === 'string' && configurableSet.has(k),
      )
    : [];

  const grantPermissionRecords =
    requestedGrants.length > 0
      ? await prisma.permission.findMany({ where: { key: { in: requestedGrants } } })
      : [];

  const result = await prisma.$transaction(async (tx) => {
    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          fullName: input.fullName.trim(),
          phone: normalizedPhone,
          email: null, // Assistants authenticate with phone number only
          passwordHash: passwordHash!,
          accountType: AccountType.ASSISTANT,
          lastLoginAt: new Date(),
        },
      }));

    if (existingUser) {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    const membership = await tx.farmMembership.upsert({
      where: {
        farmId_userId: {
          farmId: invitation.farmId,
          userId: user.id,
        },
      },
      update: {
        status: MembershipStatus.ACTIVE,
        roleId: invitation.roleId,
        invitedById: invitation.invitedById,
      },
      create: {
        farmId: invitation.farmId,
        userId: user.id,
        roleId: invitation.roleId,
        status: MembershipStatus.ACTIVE,
        invitedById: invitation.invitedById,
      },
    });

    for (const perm of grantPermissionRecords) {
      await tx.farmMembershipPermission.upsert({
        where: {
          membershipId_permissionId: {
            membershipId: membership.id,
            permissionId: perm.id,
          },
        },
        update: {
          effect: PermissionEffect.ALLOW,
          updatedById: invitation.invitedById,
        },
        create: {
          membershipId: membership.id,
          permissionId: perm.id,
          effect: PermissionEffect.ALLOW,
          updatedById: invitation.invitedById,
        },
      });
    }

    await tx.farmInvitation.update({
      where: { id: invitation.id },
      data: {
        acceptedAt: new Date(),
        acceptedByUserId: user.id,
      },
    });

    await recordAuditLog(
      {
        farmId: invitation.farmId,
        actorUserId: user.id,
        action: 'invitation.accepted',
        entityType: 'FarmMembership',
        entityId: membership.id,
        afterData: {
          phone: user.phone,
          fullName: user.fullName,
          role: invitation.role.code,
          grantedPermissions: requestedGrants,
        },
        req,
      },
      tx,
    );

    const tokens = await issueSessionTokens(
      user.id,
      user.tokenVersion,
      input.deviceLabel,
      undefined,
      tx,
    );

    return { user, tokens };
  });

  const memberships = await getUserMembershipsPayload(result.user.id);

  return {
    accessToken: result.tokens.accessToken,
    rawRefreshToken: result.tokens.rawRefreshToken,
    user: {
      id: result.user.id,
      fullName: result.user.fullName,
      phone: result.user.phone,
      email: result.user.email,
      accountType: result.user.accountType,
      preferredLocale: result.user.preferredLocale,
    },
    memberships,
  };
}

export function getConfigurablePermissionsMetadata() {
  return PERMISSIONS.filter((p) => p.isAssistantConfigurable).map((p) => ({
    key: p.key,
    module: p.module,
    description: p.description,
  }));
}
