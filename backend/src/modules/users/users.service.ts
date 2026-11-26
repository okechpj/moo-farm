import { MembershipStatus, PermissionEffect, RoleCode } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { ASSISTANT_CONFIGURABLE_PERMISSION_KEYS, PermissionKey } from '../../config/permissions';
import { resolveEffectivePermissions } from '../../middleware/auth';
import { recordAuditLog } from '../../utils/audit';
import { Errors } from '../../utils/errors';
import { normalizePhoneNumber } from '../../utils/phone';
import { generateInviteCode, sha256Hash } from '../../utils/tokens';

const INVITATION_TTL_HOURS = 72;
const CONFIGURABLE_SET = new Set<string>(ASSISTANT_CONFIGURABLE_PERMISSION_KEYS);

export async function listFarmMembers(farmId: string) {
  const memberships = await prisma.farmMembership.findMany({
    where: {
      farmId,
      status: { not: MembershipStatus.REMOVED },
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          accountType: true,
          lastLoginAt: true,
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
    orderBy: [{ role: { code: 'asc' } }, { joinedAt: 'asc' }],
  });

  return memberships.map((m) => {
    const baseKeys = m.role.rolePermissions.map((rp) => rp.permission.key);
    const effective = resolveEffectivePermissions(baseKeys, m.permissionOverrides);

    const configurablePermissions: Record<string, boolean> = {};
    for (const key of ASSISTANT_CONFIGURABLE_PERMISSION_KEYS) {
      configurablePermissions[key] = effective.has(key);
    }

    return {
      membershipId: m.id,
      status: m.status,
      joinedAt: m.joinedAt,
      user: m.user,
      role: {
        code: m.role.code,
        name: m.role.name,
      },
      effectivePermissions: Array.from(effective).sort(),
      configurablePermissions,
    };
  });
}

export async function createAssistantInvitation(
  farmId: string,
  invitedById: string,
  input: {
    phone: string;
    inviteeName?: string;
    grantedPermissions: string[];
  },
  req: Request,
) {
  const normalizedPhone = normalizePhoneNumber(input.phone);

  // Reject any attempt to pre-grant non-configurable (owner-only) permissions
  const invalidPerms = input.grantedPermissions.filter((k) => !CONFIGURABLE_SET.has(k));
  if (invalidPerms.length > 0) {
    throw Errors.badRequest(
      `These permissions cannot be granted to a farm assistant: ${invalidPerms.join(', ')}`,
    );
  }

  // Check if user is already an active member of this farm
  const existingUser = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  if (existingUser) {
    const existingMembership = await prisma.farmMembership.findUnique({
      where: { farmId_userId: { farmId, userId: existingUser.id } },
    });
    if (existingMembership && existingMembership.status === MembershipStatus.ACTIVE) {
      throw Errors.conflict('This phone number is already an active member of this farm.');
    }
  }

  const assistantRole = await prisma.role.findUnique({ where: { code: RoleCode.FARM_ASSISTANT } });
  if (!assistantRole) {
    throw new Error('System roles not seeded');
  }

  const inviteCode = generateInviteCode();
  const codeHash = sha256Hash(inviteCode);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
  const uniqueGranted = Array.from(new Set(input.grantedPermissions));

  const invitation = await prisma.$transaction(async (tx) => {
    // Revoke any previous pending invites for the same phone on this farm
    await tx.farmInvitation.updateMany({
      where: {
        farmId,
        phone: normalizedPhone,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    const created = await tx.farmInvitation.create({
      data: {
        farmId,
        roleId: assistantRole.id,
        invitedById,
        inviteeName: input.inviteeName?.trim() || null,
        phone: normalizedPhone,
        codeHash,
        grantedPermissions: uniqueGranted,
        expiresAt,
      },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId: invitedById,
        action: 'invitation.created',
        entityType: 'FarmInvitation',
        entityId: created.id,
        afterData: {
          phone: normalizedPhone,
          inviteeName: created.inviteeName,
          grantedPermissions: uniqueGranted,
          expiresAt,
        },
        req,
      },
      tx,
    );

    return created;
  });

  return {
    id: invitation.id,
    phone: invitation.phone,
    inviteeName: invitation.inviteeName,
    grantedPermissions: uniqueGranted,
    inviteCode, // Returned once so owner can share it with the assistant
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

export async function listFarmInvitations(farmId: string) {
  const invitations = await prisma.farmInvitation.findMany({
    where: { farmId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      invitedBy: { select: { fullName: true } },
    },
  });

  const now = new Date();
  return invitations.map((inv) => {
    let status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' = 'PENDING';
    if (inv.acceptedAt) status = 'ACCEPTED';
    else if (inv.revokedAt) status = 'REVOKED';
    else if (inv.expiresAt < now) status = 'EXPIRED';

    return {
      id: inv.id,
      phone: inv.phone,
      inviteeName: inv.inviteeName,
      grantedPermissions: inv.grantedPermissions,
      status,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      revokedAt: inv.revokedAt,
      invitedByName: inv.invitedBy.fullName,
      createdAt: inv.createdAt,
    };
  });
}

export async function revokeInvitation(
  farmId: string,
  invitationId: string,
  actorUserId: string,
  req: Request,
) {
  const invitation = await prisma.farmInvitation.findFirst({
    where: { id: invitationId, farmId },
  });

  if (!invitation) {
    throw Errors.notFound('Invitation not found');
  }
  if (invitation.acceptedAt) {
    throw Errors.badRequest('This invitation has already been accepted');
  }
  if (invitation.revokedAt) {
    return { revoked: true, invitationId };
  }

  await prisma.$transaction(async (tx) => {
    await tx.farmInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'invitation.revoked',
        entityType: 'FarmInvitation',
        entityId: invitationId,
        beforeData: { phone: invitation.phone },
        req,
      },
      tx,
    );
  });

  return { revoked: true, invitationId };
}

export async function updateAssistantPermissions(
  farmId: string,
  membershipId: string,
  actorUserId: string,
  permissionsMap: Record<string, boolean>,
  req: Request,
) {
  const membership = await prisma.farmMembership.findFirst({
    where: { id: membershipId, farmId },
    include: {
      role: true,
      user: { select: { fullName: true, phone: true } },
    },
  });

  if (!membership) {
    throw Errors.notFound('Farm member not found');
  }

  if (membership.role.code === RoleCode.FARM_OWNER) {
    throw Errors.badRequest('Farm owner permissions cannot be modified.');
  }

  const keys = Object.keys(permissionsMap);
  const invalidKeys = keys.filter((k) => !CONFIGURABLE_SET.has(k));
  if (invalidKeys.length > 0) {
    throw Errors.badRequest(
      `These permissions are not configurable for assistants: ${invalidKeys.join(', ')}`,
    );
  }

  const permissionRecords = await prisma.permission.findMany({
    where: { key: { in: keys } },
  });
  const permByKey = new Map(permissionRecords.map((p) => [p.key, p]));

  await prisma.$transaction(async (tx) => {
    for (const key of keys) {
      const perm = permByKey.get(key);
      if (!perm) continue;

      const enabled = permissionsMap[key];
      await tx.farmMembershipPermission.upsert({
        where: {
          membershipId_permissionId: {
            membershipId: membership.id,
            permissionId: perm.id,
          },
        },
        update: {
          effect: enabled ? PermissionEffect.ALLOW : PermissionEffect.DENY,
          updatedById: actorUserId,
        },
        create: {
          membershipId: membership.id,
          permissionId: perm.id,
          effect: enabled ? PermissionEffect.ALLOW : PermissionEffect.DENY,
          updatedById: actorUserId,
        },
      });
    }

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'member.permissions_updated',
        entityType: 'FarmMembership',
        entityId: membership.id,
        afterData: {
          memberPhone: membership.user.phone,
          updatedPermissions: permissionsMap,
        },
        req,
      },
      tx,
    );
  });

  const allMembers = await listFarmMembers(farmId);
  return allMembers.find((m) => m.membershipId === membershipId);
}

export async function updateMemberStatus(
  farmId: string,
  membershipId: string,
  actorUserId: string,
  status: MembershipStatus,
  req: Request,
) {
  const membership = await prisma.farmMembership.findFirst({
    where: { id: membershipId, farmId },
    include: {
      role: true,
      user: { select: { id: true, fullName: true, phone: true } },
    },
  });

  if (!membership) {
    throw Errors.notFound('Farm member not found');
  }

  if (membership.role.code === RoleCode.FARM_OWNER || membership.userId === actorUserId) {
    throw Errors.badRequest('Cannot suspend or remove the farm owner.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.farmMembership.update({
      where: { id: membership.id },
      data: { status },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'member.status_updated',
        entityType: 'FarmMembership',
        entityId: membership.id,
        beforeData: { status: membership.status, phone: membership.user.phone },
        afterData: { status, phone: membership.user.phone },
        req,
      },
      tx,
    );
  });

  return { membershipId: membership.id, status };
}

export async function listAuditLogs(farmId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where: { farmId } }),
    prisma.auditLog.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        actor: { select: { id: true, fullName: true, phone: true } },
      },
    }),
  ]);

  return {
    items: logs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      beforeData: l.beforeData,
      afterData: l.afterData,
      actor: l.actor,
      createdAt: l.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
