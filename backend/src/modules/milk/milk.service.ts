import { DeliveryStatus, MilkAllocationType, MilkingSession, Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { recordAuditLog } from '../../utils/audit';
import {
  formatDateOnly,
  getNairobiDateString,
  parseDateOnly,
  shiftDateString,
} from '../../utils/date';
import { Errors } from '../../utils/errors';
import { round2, toCents, toNumber } from '../../utils/numbers';
import { DailyCowOutput, evaluateCowDropAlert, ProductionDropAlert } from './milk.analytics';

function validateAllocations(
  quantityLitres: number,
  homeUseLitres: number,
  soldLitres: number,
  spoiledLitres: number,
) {
  const qtyUnits = toCents(quantityLitres);
  const allocUnits = toCents(homeUseLitres) + toCents(soldLitres) + toCents(spoiledLitres);
  if (allocUnits > qtyUnits) {
    throw Errors.validation(
      `Milk breakdown (${round2(allocUnits / 100)} L) cannot exceed total milk produced (${round2(quantityLitres)} L).`,
    );
  }
}

function buildAllocationRows(
  farmId: string,
  milkProductionId: string,
  homeUseLitres: number,
  soldLitres: number,
  spoiledLitres: number,
) {
  const rows: {
    farmId: string;
    milkProductionId: string;
    allocationType: MilkAllocationType;
    quantityLitres: number;
  }[] = [];

  if (homeUseLitres > 0) {
    rows.push({
      farmId,
      milkProductionId,
      allocationType: MilkAllocationType.HOME_USE,
      quantityLitres: round2(homeUseLitres),
    });
  }
  if (soldLitres > 0) {
    rows.push({
      farmId,
      milkProductionId,
      allocationType: MilkAllocationType.SOLD,
      quantityLitres: round2(soldLitres),
    });
  }
  if (spoiledLitres > 0) {
    rows.push({
      farmId,
      milkProductionId,
      allocationType: MilkAllocationType.SPOILED,
      quantityLitres: round2(spoiledLitres),
    });
  }
  return rows;
}

function serializeMilkRecord(record: {
  id: string;
  farmId: string;
  animalId: string;
  recordDate: Date;
  session: MilkingSession;
  quantityLitres: Prisma.Decimal;
  homeUseLitres: Prisma.Decimal;
  soldLitres: Prisma.Decimal;
  spoiledLitres: Prisma.Decimal;
  isWithheld: boolean;
  notes: string | null;
  correctionReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  animal: { id: string; name: string; tagNumber: string };
  recordedBy: { id: string; fullName: string; phone: string };
}) {
  const quantity = toNumber(record.quantityLitres);
  const homeUse = toNumber(record.homeUseLitres);
  const sold = toNumber(record.soldLitres);
  const spoiled = toNumber(record.spoiledLitres);
  const availableForSale = record.isWithheld ? 0 : Math.max(0, round2(quantity - homeUse - spoiled));

  return {
    id: record.id,
    farmId: record.farmId,
    animalId: record.animalId,
    animalName: record.animal.name,
    animalTag: record.animal.tagNumber,
    recordDate: formatDateOnly(record.recordDate),
    session: record.session,
    quantityLitres: quantity,
    homeUseLitres: homeUse,
    soldLitres: sold,
    spoiledLitres: spoiled,
    availableForSaleLitres: availableForSale,
    isWithheld: record.isWithheld,
    notes: record.notes,
    correctionReason: record.correctionReason,
    recordedBy: record.recordedBy,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listMilkRecords(
  farmId: string,
  filters: {
    animalId?: string;
    from?: string;
    to?: string;
    session?: MilkingSession;
    limit: number;
  },
) {
  const records = await prisma.milkProduction.findMany({
    where: {
      farmId,
      isSuperseded: false,
      ...(filters.animalId ? { animalId: filters.animalId } : {}),
      ...(filters.session ? { session: filters.session } : {}),
      ...(filters.from || filters.to
        ? {
            recordDate: {
              ...(filters.from ? { gte: parseDateOnly(filters.from, 'from') } : {}),
              ...(filters.to ? { lte: parseDateOnly(filters.to, 'to') } : {}),
            },
          }
        : {}),
    },
    include: {
      animal: { select: { id: true, name: true, tagNumber: true } },
      recordedBy: { select: { id: true, fullName: true, phone: true } },
    },
    orderBy: [{ recordDate: 'desc' }, { session: 'desc' }, { createdAt: 'desc' }],
    take: filters.limit,
  });

  return records.map(serializeMilkRecord);
}

export async function createMilkRecord(
  farmId: string,
  actorUserId: string,
  input: {
    id?: string;
    animalId: string;
    recordDate?: string;
    session: MilkingSession;
    quantityLitres: number;
    homeUseLitres: number;
    soldLitres: number;
    spoiledLitres: number;
    notes?: string | null;
  },
  req: Request,
) {
  validateAllocations(
    input.quantityLitres,
    input.homeUseLitres,
    input.soldLitres,
    input.spoiledLitres,
  );

  const animal = await prisma.animal.findFirst({
    where: { id: input.animalId, farmId, archivedAt: null },
  });
  if (!animal) {
    throw Errors.notFound('Selected cow was not found on this farm.');
  }

  const dateStr = input.recordDate ?? getNairobiDateString();
  const recordDate = parseDateOnly(dateStr, 'recordDate');

  // Explicit duplicate session check (also guarded at DB level by partial unique index)
  const existingSession = await prisma.milkProduction.findFirst({
    where: {
      farmId,
      animalId: animal.id,
      recordDate,
      session: input.session,
      isSuperseded: false,
    },
  });

  if (existingSession) {
    throw Errors.conflict(
      `${input.session === MilkingSession.MORNING ? 'Morning' : 'Evening'} milk for ${animal.name} on ${dateStr} has already been recorded. Use "Correct Entry" if you need to adjust it.`,
      { existingRecordId: existingSession.id },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const record = await tx.milkProduction.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        farmId,
        animalId: animal.id,
        recordDate,
        session: input.session,
        quantityLitres: round2(input.quantityLitres),
        homeUseLitres: round2(input.homeUseLitres),
        soldLitres: round2(input.soldLitres),
        spoiledLitres: round2(input.spoiledLitres),
        notes: input.notes?.trim() || null,
        recordedById: actorUserId,
      },
      include: {
        animal: { select: { id: true, name: true, tagNumber: true } },
        recordedBy: { select: { id: true, fullName: true, phone: true } },
      },
    });

    const allocRows = buildAllocationRows(
      farmId,
      record.id,
      input.homeUseLitres,
      input.soldLitres,
      input.spoiledLitres,
    );
    if (allocRows.length > 0) {
      await tx.milkAllocation.createMany({ data: allocRows });
    }

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'milk.recorded',
        entityType: 'MilkProduction',
        entityId: record.id,
        afterData: {
          animalId: animal.id,
          animalName: animal.name,
          recordDate: dateStr,
          session: input.session,
          quantityLitres: round2(input.quantityLitres),
        },
        req,
      },
      tx,
    );

    return record;
  });

  return serializeMilkRecord(created);
}

export async function correctMilkRecord(
  farmId: string,
  recordId: string,
  actorUserId: string,
  input: {
    quantityLitres: number;
    homeUseLitres: number;
    soldLitres: number;
    spoiledLitres: number;
    notes?: string | null;
    correctionReason: string;
  },
  req: Request,
) {
  validateAllocations(
    input.quantityLitres,
    input.homeUseLitres,
    input.soldLitres,
    input.spoiledLitres,
  );

  const original = await prisma.milkProduction.findFirst({
    where: { id: recordId, farmId, isSuperseded: false },
    include: { animal: { select: { id: true, name: true, tagNumber: true } } },
  });

  if (!original) {
    throw Errors.notFound('Milk record not found or already superseded.');
  }

  const corrected = await prisma.$transaction(async (tx) => {
    // 1. Mark original record superseded first so the partial unique index frees the slot
    await tx.milkProduction.update({
      where: { id: original.id },
      data: {
        isSuperseded: true,
        version: { increment: 1 },
      },
    });

    // 2. Insert replacement record preserving full audit trail
    const replacement = await tx.milkProduction.create({
      data: {
        farmId,
        animalId: original.animalId,
        recordDate: original.recordDate,
        session: original.session,
        quantityLitres: round2(input.quantityLitres),
        homeUseLitres: round2(input.homeUseLitres),
        soldLitres: round2(input.soldLitres),
        spoiledLitres: round2(input.spoiledLitres),
        isWithheld: original.isWithheld,
        notes: input.notes !== undefined ? input.notes?.trim() || null : original.notes,
        correctionReason: input.correctionReason.trim(),
        recordedById: actorUserId,
        version: original.version + 1,
      },
      include: {
        animal: { select: { id: true, name: true, tagNumber: true } },
        recordedBy: { select: { id: true, fullName: true, phone: true } },
      },
    });

    // 3. Link original -> replacement
    await tx.milkProduction.update({
      where: { id: original.id },
      data: { supersededById: replacement.id },
    });

    const allocRows = buildAllocationRows(
      farmId,
      replacement.id,
      input.homeUseLitres,
      input.soldLitres,
      input.spoiledLitres,
    );
    if (allocRows.length > 0) {
      await tx.milkAllocation.createMany({ data: allocRows });
    }

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'milk.corrected',
        entityType: 'MilkProduction',
        entityId: replacement.id,
        beforeData: {
          originalId: original.id,
          quantityLitres: toNumber(original.quantityLitres),
          homeUseLitres: toNumber(original.homeUseLitres),
          soldLitres: toNumber(original.soldLitres),
          spoiledLitres: toNumber(original.spoiledLitres),
        },
        afterData: {
          replacementId: replacement.id,
          quantityLitres: round2(input.quantityLitres),
          homeUseLitres: round2(input.homeUseLitres),
          soldLitres: round2(input.soldLitres),
          spoiledLitres: round2(input.spoiledLitres),
          correctionReason: input.correctionReason.trim(),
        },
        req,
      },
      tx,
    );

    return replacement;
  });

  return serializeMilkRecord(corrected);
}

export async function getMilkSummary(
  farmId: string,
  options: { animalId?: string; days: number },
) {
  const todayStr = getNairobiDateString();
  const weekStartStr = shiftDateString(todayStr, -6);
  const monthStartStr = shiftDateString(todayStr, -29);
  const trendStartStr = shiftDateString(todayStr, -(options.days - 1));

  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: {
      milkDropAlertThresholdPct: true,
      milkDropBaselineDays: true,
    },
  });

  const baselineDays = farm?.milkDropBaselineDays ?? 7;
  const thresholdPct = toNumber(farm?.milkDropAlertThresholdPct ?? 20);
  const historyLookbackStr = shiftDateString(
    todayStr,
    -Math.max(30, options.days, baselineDays + 14),
  );

  const records = await prisma.milkProduction.findMany({
    where: {
      farmId,
      isSuperseded: false,
      ...(options.animalId ? { animalId: options.animalId } : {}),
      recordDate: { gte: parseDateOnly(historyLookbackStr) },
    },
    include: {
      animal: { select: { id: true, name: true, tagNumber: true } },
    },
    orderBy: [{ recordDate: 'asc' }, { session: 'asc' }],
  });

  let todayMorning = 0;
  let todayEvening = 0;
  let todayHomeUse = 0;
  let todaySold = 0;
  let todaySpoiled = 0;
  let todayWithheld = 0;

  let weeklyTotal = 0;
  let monthlyTotal = 0;
  let monthlyHomeUse = 0;
  let monthlySold = 0;
  let monthlySpoiled = 0;

  const monthlyActiveDays = new Set<string>();
  const dailyTrendMap = new Map<
    string,
    { date: string; morningLitres: number; eveningLitres: number; totalLitres: number }
  >();

  for (let i = 0; i < options.days; i++) {
    const d = shiftDateString(trendStartStr, i);
    dailyTrendMap.set(d, { date: d, morningLitres: 0, eveningLitres: 0, totalLitres: 0 });
  }

  // Group daily totals per cow for drop-alert evaluation
  const cowMeta = new Map<string, { name: string; tagNumber: string }>();
  const cowDailyMap = new Map<string, Map<string, { total: number; sessions: number }>>();

  for (const r of records) {
    const dStr = formatDateOnly(r.recordDate);
    const qty = toNumber(r.quantityLitres);
    const home = toNumber(r.homeUseLitres);
    const sold = toNumber(r.soldLitres);
    const spoiled = toNumber(r.spoiledLitres);

    if (dStr === todayStr) {
      if (r.session === MilkingSession.MORNING) todayMorning += qty;
      else todayEvening += qty;
      todayHomeUse += home;
      todaySold += sold;
      todaySpoiled += spoiled;
      if (r.isWithheld) todayWithheld += qty;
    }

    if (dStr >= weekStartStr && dStr <= todayStr) {
      weeklyTotal += qty;
    }

    if (dStr >= monthStartStr && dStr <= todayStr) {
      monthlyTotal += qty;
      monthlyHomeUse += home;
      monthlySold += sold;
      monthlySpoiled += spoiled;
      monthlyActiveDays.add(dStr);
    }

    const trendBucket = dailyTrendMap.get(dStr);
    if (trendBucket) {
      if (r.session === MilkingSession.MORNING) trendBucket.morningLitres += qty;
      else trendBucket.eveningLitres += qty;
      trendBucket.totalLitres += qty;
    }

    cowMeta.set(r.animalId, { name: r.animal.name, tagNumber: r.animal.tagNumber });
    let perDate = cowDailyMap.get(r.animalId);
    if (!perDate) {
      perDate = new Map();
      cowDailyMap.set(r.animalId, perDate);
    }
    const existing = perDate.get(dStr) ?? { total: 0, sessions: 0 };
    existing.total += qty;
    existing.sessions += 1;
    perDate.set(dStr, existing);
  }

  const productionAlerts: ProductionDropAlert[] = [];
  for (const [animalId, perDate] of cowDailyMap.entries()) {
    const meta = cowMeta.get(animalId)!;
    const series: DailyCowOutput[] = Array.from(perDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, info]) => ({
        date,
        totalLitres: round2(info.total),
        sessionCount: info.sessions,
      }));

    const alert = evaluateCowDropAlert({
      animalId,
      animalName: meta.name,
      tagNumber: meta.tagNumber,
      dailySeries: series,
      baselineDays,
      thresholdPercent: thresholdPct,
    });
    if (alert) productionAlerts.push(alert);
  }

  const todayTotal = round2(todayMorning + todayEvening);
  const todayAvailableForSale = Math.max(
    0,
    round2(todayTotal - todayHomeUse - todaySpoiled - todayWithheld),
  );
  const averageDailyLitres =
    monthlyActiveDays.size > 0 ? round2(monthlyTotal / monthlyActiveDays.size) : 0;

  return {
    nairobiDate: todayStr,
    today: {
      morningLitres: round2(todayMorning),
      eveningLitres: round2(todayEvening),
      totalLitres: todayTotal,
      homeUseLitres: round2(todayHomeUse),
      soldLitres: round2(todaySold),
      spoiledLitres: round2(todaySpoiled),
      withheldLitres: round2(todayWithheld),
      availableForSaleLitres: todayAvailableForSale,
    },
    weeklyTotalLitres: round2(weeklyTotal),
    monthly: {
      totalLitres: round2(monthlyTotal),
      homeUseLitres: round2(monthlyHomeUse),
      soldLitres: round2(monthlySold),
      spoiledLitres: round2(monthlySpoiled),
      averageDailyLitres,
      recordedDays: monthlyActiveDays.size,
    },
    dailyTrend: Array.from(dailyTrendMap.values()).map((d) => ({
      date: d.date,
      morningLitres: round2(d.morningLitres),
      eveningLitres: round2(d.eveningLitres),
      totalLitres: round2(d.totalLitres),
    })),
    productionAlerts,
  };
}

export async function getSupplyBalance(farmId: string, dateStr?: string) {
  const targetDateStr = dateStr ?? getNairobiDateString();
  const targetDate = parseDateOnly(targetDateStr, 'date');

  const [milkRecords, activeCustomers, deliveries] = await Promise.all([
    prisma.milkProduction.findMany({
      where: { farmId, recordDate: targetDate, isSuperseded: false },
    }),
    prisma.customer.findMany({
      where: { farmId, status: 'ACTIVE', archivedAt: null },
      select: { id: true, expectedDailyLitres: true },
    }),
    prisma.milkDelivery.findMany({
      where: {
        farmId,
        deliveryDate: targetDate,
        deliveryStatus: { not: DeliveryStatus.CANCELLED },
      },
      select: { quantityLitres: true, deliveryStatus: true },
    }),
  ]);

  let totalProduced = 0;
  let homeUse = 0;
  let spoiled = 0;
  let withheld = 0;

  for (const r of milkRecords) {
    const qty = toNumber(r.quantityLitres);
    totalProduced += qty;
    homeUse += toNumber(r.homeUseLitres);
    spoiled += toNumber(r.spoiledLitres);
    if (r.isWithheld) withheld += qty;
  }

  const availableForSale = Math.max(0, round2(totalProduced - homeUse - spoiled - withheld));
  const totalCustomerDemand = round2(
    activeCustomers.reduce((sum, c) => sum + toNumber(c.expectedDailyLitres), 0),
  );
  const deliveredLitres = round2(
    deliveries
      .filter((d) => d.deliveryStatus === DeliveryStatus.DELIVERED)
      .reduce((sum, d) => sum + toNumber(d.quantityLitres), 0),
  );
  const pendingDeliveryLitres = round2(
    deliveries
      .filter((d) => d.deliveryStatus === DeliveryStatus.PENDING)
      .reduce((sum, d) => sum + toNumber(d.quantityLitres), 0),
  );

  const unfulfilledDemandLitres = Math.max(0, round2(totalCustomerDemand - deliveredLitres));
  const supplyShortageLitres = Math.max(0, round2(totalCustomerDemand - availableForSale));
  const isSupplyShortage = totalCustomerDemand > 0 && supplyShortageLitres > 0;

  return {
    date: targetDateStr,
    totalProducedLitres: round2(totalProduced),
    homeUseLitres: round2(homeUse),
    spoiledLitres: round2(spoiled),
    withheldLitres: round2(withheld),
    availableForSaleLitres: availableForSale,
    totalCustomerDemandLitres: totalCustomerDemand,
    deliveredLitres,
    pendingDeliveryLitres,
    unfulfilledDemandLitres,
    supplyShortageLitres,
    isSupplyShortage,
  };
}
