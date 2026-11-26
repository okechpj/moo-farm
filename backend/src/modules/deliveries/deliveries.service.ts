import { CustomerStatus, DeliveryStatus, PaymentStatus, Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { recordAuditLog } from '../../utils/audit';
import { formatDateOnly, getNairobiDateString, parseDateOnly } from '../../utils/date';
import { Errors } from '../../utils/errors';
import { round2, toCents, toNumber } from '../../utils/numbers';
import { getSupplyBalance } from '../milk/milk.service';

function serializeDelivery(d: {
  id: string;
  farmId: string;
  customerId: string;
  deliveryDate: Date;
  quantityLitres: Prisma.Decimal;
  unitPriceKes: Prisma.Decimal;
  totalAmountKes: Prisma.Decimal;
  paidAmountKes: Prisma.Decimal;
  deliveryStatus: DeliveryStatus;
  paymentStatus: PaymentStatus;
  notes: string | null;
  version: number;
  createdAt: Date;
  customer: { id: string; name: string; phone: string; location: string | null };
  recordedBy: { id: string; fullName: string };
}) {
  return {
    id: d.id,
    farmId: d.farmId,
    customerId: d.customerId,
    customer: d.customer,
    deliveryDate: formatDateOnly(d.deliveryDate),
    quantityLitres: toNumber(d.quantityLitres),
    unitPriceKes: toNumber(d.unitPriceKes),
    totalAmountKes: toNumber(d.totalAmountKes),
    paidAmountKes: toNumber(d.paidAmountKes),
    deliveryStatus: d.deliveryStatus,
    paymentStatus: d.paymentStatus,
    notes: d.notes,
    recordedBy: d.recordedBy,
    version: d.version,
    createdAt: d.createdAt,
  };
}

export async function listDeliveries(
  farmId: string,
  filters: {
    date?: string;
    from?: string;
    to?: string;
    customerId?: string;
    deliveryStatus?: DeliveryStatus;
    limit: number;
  },
) {
  const deliveries = await prisma.milkDelivery.findMany({
    where: {
      farmId,
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.deliveryStatus ? { deliveryStatus: filters.deliveryStatus } : {}),
      ...(filters.date
        ? { deliveryDate: parseDateOnly(filters.date, 'date') }
        : filters.from || filters.to
          ? {
              deliveryDate: {
                ...(filters.from ? { gte: parseDateOnly(filters.from, 'from') } : {}),
                ...(filters.to ? { lte: parseDateOnly(filters.to, 'to') } : {}),
              },
            }
          : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, location: true } },
      recordedBy: { select: { id: true, fullName: true } },
    },
    orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
    take: filters.limit,
  });

  return deliveries.map(serializeDelivery);
}

export async function getDailyDeliveryChecklist(farmId: string, dateStr?: string) {
  const targetDateStr = dateStr ?? getNairobiDateString();
  const targetDate = parseDateOnly(targetDateStr, 'date');

  const [customers, deliveries, supplyBalance] = await Promise.all([
    prisma.customer.findMany({
      where: { farmId, status: CustomerStatus.ACTIVE, archivedAt: null },
      orderBy: { name: 'asc' },
    }),
    prisma.milkDelivery.findMany({
      where: {
        farmId,
        deliveryDate: targetDate,
        deliveryStatus: { not: DeliveryStatus.CANCELLED },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, location: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    getSupplyBalance(farmId, targetDateStr),
  ]);

  const deliveriesByCustomer = new Map<string, ReturnType<typeof serializeDelivery>[]>();
  for (const d of deliveries) {
    const list = deliveriesByCustomer.get(d.customerId) ?? [];
    list.push(serializeDelivery(d));
    deliveriesByCustomer.set(d.customerId, list);
  }

  const checklist = customers.map((c) => {
    const custDeliveries = deliveriesByCustomer.get(c.id) ?? [];
    const deliveredTodayLitres = round2(
      custDeliveries
        .filter((d) => d.deliveryStatus === DeliveryStatus.DELIVERED)
        .reduce((sum, d) => sum + d.quantityLitres, 0),
    );
    const pendingTodayLitres = round2(
      custDeliveries
        .filter((d) => d.deliveryStatus === DeliveryStatus.PENDING)
        .reduce((sum, d) => sum + d.quantityLitres, 0),
    );
    const expectedDailyLitres = toNumber(c.expectedDailyLitres);
    const remainingLitres = Math.max(0, round2(expectedDailyLitres - deliveredTodayLitres));

    return {
      customerId: c.id,
      name: c.name,
      phone: c.phone,
      location: c.location,
      agreedPricePerLitre: toNumber(c.agreedPricePerLitre),
      expectedDailyLitres,
      deliveredTodayLitres,
      pendingTodayLitres,
      remainingLitres,
      isFulfilled: expectedDailyLitres > 0 ? deliveredTodayLitres >= expectedDailyLitres : deliveredTodayLitres > 0,
      deliveries: custDeliveries,
    };
  });

  return {
    date: targetDateStr,
    supplyBalance,
    checklist,
  };
}

export async function createDelivery(
  farmId: string,
  actorUserId: string,
  input: {
    id?: string;
    customerId: string;
    deliveryDate?: string;
    quantityLitres: number;
    deliveryStatus: DeliveryStatus;
    notes?: string | null;
  },
  req: Request,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, farmId, archivedAt: null },
  });
  if (!customer) {
    throw Errors.notFound('Customer not found on this farm.');
  }

  const dateStr = input.deliveryDate ?? getNairobiDateString();
  const deliveryDate = parseDateOnly(dateStr, 'deliveryDate');

  // Always snapshot customer's agreed KES/litre price from DB (assistants cannot alter pricing)
  const unitPriceKes = toNumber(customer.agreedPricePerLitre);
  const quantityLitres = round2(input.quantityLitres);
  const totalAmountKes = round2(quantityLitres * unitPriceKes);

  const created = await prisma.$transaction(async (tx) => {
    const delivery = await tx.milkDelivery.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        farmId,
        customerId: customer.id,
        deliveryDate,
        quantityLitres,
        unitPriceKes,
        totalAmountKes,
        paidAmountKes: 0,
        deliveryStatus: input.deliveryStatus,
        paymentStatus: PaymentStatus.UNPAID,
        notes: input.notes?.trim() || null,
        recordedById: actorUserId,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, location: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'delivery.recorded',
        entityType: 'MilkDelivery',
        entityId: delivery.id,
        afterData: {
          customerName: customer.name,
          deliveryDate: dateStr,
          quantityLitres,
          unitPriceKes,
          totalAmountKes,
          deliveryStatus: input.deliveryStatus,
        },
        req,
      },
      tx,
    );

    return delivery;
  });

  return serializeDelivery(created);
}

export async function updateDelivery(
  farmId: string,
  deliveryId: string,
  actorUserId: string,
  input: {
    quantityLitres?: number;
    deliveryStatus?: DeliveryStatus;
    notes?: string | null;
  },
  req: Request,
) {
  const existing = await prisma.milkDelivery.findFirst({
    where: { id: deliveryId, farmId },
    include: { customer: { select: { name: true } } },
  });
  if (!existing) {
    throw Errors.notFound('Delivery record not found.');
  }

  const paidCents = toCents(existing.paidAmountKes);
  if (input.deliveryStatus === DeliveryStatus.CANCELLED && paidCents > 0) {
    throw Errors.badRequest(
      'Cannot cancel a delivery that already has recorded payments. Void the payment first.',
    );
  }

  const nextQty =
    input.quantityLitres !== undefined
      ? round2(input.quantityLitres)
      : toNumber(existing.quantityLitres);
  const unitPrice = toNumber(existing.unitPriceKes);
  const nextTotal = round2(nextQty * unitPrice);
  const nextTotalCents = toCents(nextTotal);

  if (nextTotalCents < paidCents) {
    throw Errors.badRequest(
      'New delivery total cannot be lower than the amount already paid against this delivery.',
    );
  }

  let nextPaymentStatus = existing.paymentStatus;
  if (paidCents === 0) nextPaymentStatus = PaymentStatus.UNPAID;
  else if (paidCents >= nextTotalCents) nextPaymentStatus = PaymentStatus.PAID;
  else nextPaymentStatus = PaymentStatus.PARTIALLY_PAID;

  const updated = await prisma.$transaction(async (tx) => {
    const delivery = await tx.milkDelivery.update({
      where: { id: existing.id },
      data: {
        quantityLitres: nextQty,
        totalAmountKes: nextTotal,
        paymentStatus: nextPaymentStatus,
        ...(input.deliveryStatus !== undefined ? { deliveryStatus: input.deliveryStatus } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ? input.notes.trim() : null } : {}),
        version: { increment: 1 },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, location: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'delivery.updated',
        entityType: 'MilkDelivery',
        entityId: delivery.id,
        beforeData: {
          quantityLitres: toNumber(existing.quantityLitres),
          totalAmountKes: toNumber(existing.totalAmountKes),
          deliveryStatus: existing.deliveryStatus,
        },
        afterData: {
          quantityLitres: nextQty,
          totalAmountKes: nextTotal,
          deliveryStatus: delivery.deliveryStatus,
        },
        req,
      },
      tx,
    );

    return delivery;
  });

  return serializeDelivery(updated);
}
