import { AnimalStatus, DeliveryStatus, MembershipStatus, RoleCode } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { recordAuditLog } from '../../utils/audit';
import { getNairobiDateString, getNairobiDateTimeLabel, parseDateOnly } from '../../utils/date';
import { Errors } from '../../utils/errors';
import { round2, toNumber } from '../../utils/numbers';
import { computeCustomerBalances } from '../customers/customers.service';
import { getMilkSummary, getSupplyBalance } from '../milk/milk.service';

export async function createFarm(
  ownerUserId: string,
  input: {
    name: string;
    location?: string;
    milkDropAlertThresholdPct?: number;
    milkDropBaselineDays?: number;
  },
  req: Request,
) {
  const ownerRole = await prisma.role.findUnique({ where: { code: RoleCode.FARM_OWNER } });
  if (!ownerRole) {
    throw new Error('System roles not seeded');
  }

  return prisma.$transaction(async (tx) => {
    const farm = await tx.farm.create({
      data: {
        name: input.name.trim(),
        location: input.location?.trim() || null,
        milkDropAlertThresholdPct: input.milkDropAlertThresholdPct ?? 20,
        milkDropBaselineDays: input.milkDropBaselineDays ?? 7,
        createdById: ownerUserId,
      },
    });

    const membership = await tx.farmMembership.create({
      data: {
        farmId: farm.id,
        userId: ownerUserId,
        roleId: ownerRole.id,
        status: MembershipStatus.ACTIVE,
      },
    });

    await recordAuditLog(
      {
        farmId: farm.id,
        actorUserId: ownerUserId,
        action: 'farm.created',
        entityType: 'Farm',
        entityId: farm.id,
        afterData: { name: farm.name, location: farm.location },
        req,
      },
      tx,
    );

    return {
      id: farm.id,
      name: farm.name,
      location: farm.location,
      timezone: farm.timezone,
      currency: farm.currency,
      milkDropAlertThresholdPct: Number(farm.milkDropAlertThresholdPct),
      milkDropBaselineDays: farm.milkDropBaselineDays,
      membershipId: membership.id,
      createdAt: farm.createdAt,
    };
  });
}

export async function getFarmById(farmId: string) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, archivedAt: null },
    include: {
      _count: {
        select: {
          memberships: { where: { status: MembershipStatus.ACTIVE } },
        },
      },
    },
  });

  if (!farm) {
    throw Errors.notFound('Farm not found');
  }

  return {
    id: farm.id,
    name: farm.name,
    location: farm.location,
    timezone: farm.timezone,
    currency: farm.currency,
    milkDropAlertThresholdPct: Number(farm.milkDropAlertThresholdPct),
    milkDropBaselineDays: farm.milkDropBaselineDays,
    activeMembersCount: farm._count.memberships,
    version: farm.version,
    createdAt: farm.createdAt,
    updatedAt: farm.updatedAt,
  };
}

export async function updateFarm(
  farmId: string,
  actorUserId: string,
  input: {
    name?: string;
    location?: string | null;
    milkDropAlertThresholdPct?: number;
    milkDropBaselineDays?: number;
  },
  req: Request,
) {
  const existing = await prisma.farm.findFirst({ where: { id: farmId, archivedAt: null } });
  if (!existing) {
    throw Errors.notFound('Farm not found');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const farm = await tx.farm.update({
      where: { id: farmId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.location !== undefined
          ? { location: input.location ? input.location.trim() : null }
          : {}),
        ...(input.milkDropAlertThresholdPct !== undefined
          ? { milkDropAlertThresholdPct: input.milkDropAlertThresholdPct }
          : {}),
        ...(input.milkDropBaselineDays !== undefined
          ? { milkDropBaselineDays: input.milkDropBaselineDays }
          : {}),
        version: { increment: 1 },
      },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'farm.updated',
        entityType: 'Farm',
        entityId: farmId,
        beforeData: {
          name: existing.name,
          location: existing.location,
          milkDropAlertThresholdPct: Number(existing.milkDropAlertThresholdPct),
          milkDropBaselineDays: existing.milkDropBaselineDays,
        },
        afterData: {
          name: farm.name,
          location: farm.location,
          milkDropAlertThresholdPct: Number(farm.milkDropAlertThresholdPct),
          milkDropBaselineDays: farm.milkDropBaselineDays,
        },
        req,
      },
      tx,
    );

    return farm;
  });

  return {
    id: updated.id,
    name: updated.name,
    location: updated.location,
    timezone: updated.timezone,
    currency: updated.currency,
    milkDropAlertThresholdPct: Number(updated.milkDropAlertThresholdPct),
    milkDropBaselineDays: updated.milkDropBaselineDays,
    version: updated.version,
    updatedAt: updated.updatedAt,
  };
}

export async function archiveFarm(farmId: string, actorUserId: string, req: Request) {
  const existing = await prisma.farm.findFirst({ where: { id: farmId, archivedAt: null } });
  if (!existing) {
    throw Errors.notFound('Farm not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.farm.update({
      where: { id: farmId },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'farm.archived',
        entityType: 'Farm',
        entityId: farmId,
        beforeData: { name: existing.name },
        req,
      },
      tx,
    );
  });

  return { archived: true, farmId };
}

export async function getFarmDashboard(
  farmId: string,
  roleCode: RoleCode,
  roleName: string,
  permissions: Set<string>,
) {
  const todayStr = getNairobiDateString();
  const todayDate = parseDateOnly(todayStr);

  const canManageUsers = permissions.has('users.manage');
  const canViewAudit = permissions.has('audit.view');
  const canViewPayments = permissions.has('payments.view');

  const [
    farm,
    activeAnimals,
    milkSummary,
    supplyBalance,
    todayDeliveries,
    customerBalances,
    pendingInvitationsCount,
    recentAuditLogs,
  ] = await Promise.all([
    getFarmById(farmId),
    prisma.animal.findMany({
      where: { farmId, archivedAt: null },
      select: { id: true, name: true, tagNumber: true, breed: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
    getMilkSummary(farmId, { days: 7 }),
    getSupplyBalance(farmId, todayStr),
    prisma.milkDelivery.findMany({
      where: {
        farmId,
        deliveryDate: todayDate,
        deliveryStatus: { not: DeliveryStatus.CANCELLED },
      },
      select: { deliveryStatus: true, quantityLitres: true },
    }),
    canViewPayments ? computeCustomerBalances(farmId) : Promise.resolve(null),
    canManageUsers
      ? prisma.farmInvitation.count({
          where: {
            farmId,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        })
      : Promise.resolve(null),
    canViewAudit
      ? prisma.auditLog.findMany({
          where: { farmId },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: {
            actor: { select: { id: true, fullName: true, phone: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  let primaryCowTodayLitres = 0;
  if (activeAnimals.length === 1) {
    const sum = await prisma.milkProduction.aggregate({
      where: {
        farmId,
        animalId: activeAnimals[0].id,
        recordDate: todayDate,
        isSuperseded: false,
      },
      _sum: { quantityLitres: true },
    });
    primaryCowTodayLitres = round2(toNumber(sum._sum.quantityLitres));
  }

  let outstandingBalances: {
    totalOutstandingKes: number;
    customersWithBalanceCount: number;
  } | null = null;

  if (customerBalances) {
    let totalOutstanding = 0;
    let count = 0;
    for (const bal of customerBalances.values()) {
      if (bal.outstandingBalanceKes > 0) {
        totalOutstanding += bal.outstandingBalanceKes;
        count += 1;
      }
    }
    outstandingBalances = {
      totalOutstandingKes: round2(totalOutstanding),
      customersWithBalanceCount: count,
    };
  }

  const completedDeliveriesCount = todayDeliveries.filter(
    (d) => d.deliveryStatus === DeliveryStatus.DELIVERED,
  ).length;
  const pendingDeliveriesCount = todayDeliveries.filter(
    (d) => d.deliveryStatus === DeliveryStatus.PENDING,
  ).length;

  const now = new Date();

  return {
    farm,
    viewer: {
      roleCode,
      roleName,
      permissions: Array.from(permissions).sort(),
    },
    clock: {
      nairobiDate: todayStr,
      nairobiLabel: getNairobiDateTimeLabel(now),
      timezone: farm.timezone,
      currency: farm.currency,
    },
    herd: {
      totalActiveCows: activeAnimals.length,
      milkingCowsCount: activeAnimals.filter((a) => a.status === AnimalStatus.MILKING).length,
      primaryCow:
        activeAnimals.length === 1
          ? {
              ...activeAnimals[0],
              todayLitres: primaryCowTodayLitres,
            }
          : null,
    },
    milkToday: milkSummary.today,
    productionAlerts: milkSummary.productionAlerts,
    deliveriesToday: {
      completedCount: completedDeliveriesCount,
      pendingCount: pendingDeliveriesCount,
      deliveredLitres: supplyBalance.deliveredLitres,
      expectedDemandLitres: supplyBalance.totalCustomerDemandLitres,
      unfulfilledDemandLitres: supplyBalance.unfulfilledDemandLitres,
      supplyShortageLitres: supplyBalance.supplyShortageLitres,
      isSupplyShortage: supplyBalance.isSupplyShortage,
    },
    outstandingBalances,
    team: {
      activeMembersCount: farm.activeMembersCount,
      pendingInvitationsCount,
    },
    recentActivity: recentAuditLogs
      ? recentAuditLogs.map((log) => ({
          id: log.id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          actorName: log.actor?.fullName ?? 'System',
          actorPhone: log.actor?.phone ?? null,
          createdAt: log.createdAt,
        }))
      : null,
  };
}
