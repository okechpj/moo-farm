import { DeliveryStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { recordAuditLog } from '../../utils/audit';
import { formatDateOnly, getNairobiDateString, parseDateOnly } from '../../utils/date';
import { Errors } from '../../utils/errors';
import { fromCents, round2, toCents, toNumber } from '../../utils/numbers';
import { computeCustomerBalances } from '../customers/customers.service';

export interface AllocationPlanItem {
  milkDeliveryId: string;
  allocatedCents: number;
  newPaidCents: number;
  newPaymentStatus: PaymentStatus;
}

/**
 * Pure FIFO payment allocation planner (in integer cents) for exact financial math
 * and easy unit testing.
 */
export function planFifoPaymentAllocations(
  paymentCents: number,
  openDeliveries: { id: string; totalCents: number; paidCents: number }[],
): { allocations: AllocationPlanItem[]; unallocatedCents: number } {
  let remaining = paymentCents;
  const allocations: AllocationPlanItem[] = [];

  for (const delivery of openDeliveries) {
    if (remaining <= 0) break;
    const unpaid = Math.max(0, delivery.totalCents - delivery.paidCents);
    if (unpaid <= 0) continue;

    const alloc = Math.min(remaining, unpaid);
    const newPaidCents = delivery.paidCents + alloc;
    const newPaymentStatus =
      newPaidCents >= delivery.totalCents
        ? PaymentStatus.PAID
        : PaymentStatus.PARTIALLY_PAID;

    allocations.push({
      milkDeliveryId: delivery.id,
      allocatedCents: alloc,
      newPaidCents,
      newPaymentStatus,
    });
    remaining -= alloc;
  }

  return { allocations, unallocatedCents: remaining };
}

function serializePayment(p: {
  id: string;
  farmId: string;
  customerId: string;
  paymentDate: Date;
  amountKes: Prisma.Decimal;
  method: PaymentMethod;
  referenceCode: string | null;
  notes: string | null;
  isVoided: boolean;
  voidReason: string | null;
  voidedAt: Date | null;
  createdAt: Date;
  customer: { id: string; name: string; phone: string };
  recordedBy: { id: string; fullName: string };
  allocations?: { milkDeliveryId: string; allocatedAmountKes: Prisma.Decimal }[];
}) {
  return {
    id: p.id,
    farmId: p.farmId,
    customerId: p.customerId,
    customer: p.customer,
    paymentDate: formatDateOnly(p.paymentDate),
    amountKes: toNumber(p.amountKes),
    method: p.method,
    referenceCode: p.referenceCode,
    notes: p.notes,
    isVoided: p.isVoided,
    voidReason: p.voidReason,
    voidedAt: p.voidedAt,
    recordedBy: p.recordedBy,
    allocations: p.allocations
      ? p.allocations.map((a) => ({
          milkDeliveryId: a.milkDeliveryId,
          allocatedAmountKes: toNumber(a.allocatedAmountKes),
        }))
      : undefined,
    createdAt: p.createdAt,
  };
}

export async function listPayments(
  farmId: string,
  filters: {
    customerId?: string;
    from?: string;
    to?: string;
    includeVoided?: boolean;
    limit: number;
  },
) {
  const payments = await prisma.payment.findMany({
    where: {
      farmId,
      ...(filters.includeVoided ? {} : { isVoided: false }),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.from || filters.to
        ? {
            paymentDate: {
              ...(filters.from ? { gte: parseDateOnly(filters.from, 'from') } : {}),
              ...(filters.to ? { lte: parseDateOnly(filters.to, 'to') } : {}),
            },
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      recordedBy: { select: { id: true, fullName: true } },
      allocations: { select: { milkDeliveryId: true, allocatedAmountKes: true } },
    },
    orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    take: filters.limit,
  });

  return payments.map(serializePayment);
}

export async function recordPayment(
  farmId: string,
  actorUserId: string,
  input: {
    id?: string;
    customerId: string;
    paymentDate?: string;
    amountKes: number;
    method: PaymentMethod;
    referenceCode?: string | null;
    notes?: string | null;
    targetDeliveryId?: string;
  },
  req: Request,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, farmId, archivedAt: null },
  });
  if (!customer) {
    throw Errors.notFound('Customer not found on this farm.');
  }

  const dateStr = input.paymentDate ?? getNairobiDateString();
  const paymentDate = parseDateOnly(dateStr, 'paymentDate');
  const amountKes = round2(input.amountKes);
  const amountCents = toCents(amountKes);

  const createdPayment = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        farmId,
        customerId: customer.id,
        paymentDate,
        amountKes,
        method: input.method,
        referenceCode: input.referenceCode?.trim() || null,
        notes: input.notes?.trim() || null,
        recordedById: actorUserId,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
    });

    const openDeliveries = await tx.milkDelivery.findMany({
      where: {
        farmId,
        customerId: customer.id,
        deliveryStatus: DeliveryStatus.DELIVERED,
        paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID] },
      },
      orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'asc' }],
    });

    // Prioritize specific target delivery if requested, then FIFO oldest first
    const orderedDeliveries = input.targetDeliveryId
      ? [
          ...openDeliveries.filter((d) => d.id === input.targetDeliveryId),
          ...openDeliveries.filter((d) => d.id !== input.targetDeliveryId),
        ]
      : openDeliveries;

    const { allocations } = planFifoPaymentAllocations(
      amountCents,
      orderedDeliveries.map((d) => ({
        id: d.id,
        totalCents: toCents(d.totalAmountKes),
        paidCents: toCents(d.paidAmountKes),
      })),
    );

    if (allocations.length > 0) {
      await tx.paymentAllocation.createMany({
        data: allocations.map((a) => ({
          farmId,
          paymentId: payment.id,
          milkDeliveryId: a.milkDeliveryId,
          allocatedAmountKes: fromCents(a.allocatedCents),
        })),
      });

      for (const a of allocations) {
        await tx.milkDelivery.update({
          where: { id: a.milkDeliveryId },
          data: {
            paidAmountKes: fromCents(a.newPaidCents),
            paymentStatus: a.newPaymentStatus,
            version: { increment: 1 },
          },
        });
      }
    }

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'payment.recorded',
        entityType: 'Payment',
        entityId: payment.id,
        afterData: {
          customerName: customer.name,
          amountKes,
          method: input.method,
          referenceCode: payment.referenceCode,
          allocationsCount: allocations.length,
        },
        req,
      },
      tx,
    );

    return {
      ...payment,
      allocations: allocations.map((a) => ({
        milkDeliveryId: a.milkDeliveryId,
        allocatedAmountKes: new Prisma.Decimal(fromCents(a.allocatedCents)),
      })),
    };
  });

  const balances = await computeCustomerBalances(farmId, [customer.id]);

  return {
    payment: serializePayment(createdPayment),
    customerBalance: balances.get(customer.id) ?? null,
  };
}

export async function voidPayment(
  farmId: string,
  paymentId: string,
  actorUserId: string,
  reason: string,
  req: Request,
) {
  const existing = await prisma.payment.findFirst({
    where: { id: paymentId, farmId },
    include: {
      customer: { select: { id: true, name: true } },
      allocations: true,
    },
  });

  if (!existing) {
    throw Errors.notFound('Payment record not found.');
  }
  if (existing.isVoided) {
    throw Errors.badRequest('This payment has already been voided.');
  }

  await prisma.$transaction(async (tx) => {
    // Reverse allocations on affected deliveries
    for (const alloc of existing.allocations) {
      const delivery = await tx.milkDelivery.findUnique({
        where: { id: alloc.milkDeliveryId },
      });
      if (!delivery) continue;

      const nextPaidCents = Math.max(
        0,
        toCents(delivery.paidAmountKes) - toCents(alloc.allocatedAmountKes),
      );
      const totalCents = toCents(delivery.totalAmountKes);
      const nextStatus =
        nextPaidCents <= 0
          ? PaymentStatus.UNPAID
          : nextPaidCents >= totalCents
            ? PaymentStatus.PAID
            : PaymentStatus.PARTIALLY_PAID;

      await tx.milkDelivery.update({
        where: { id: delivery.id },
        data: {
          paidAmountKes: fromCents(nextPaidCents),
          paymentStatus: nextStatus,
          version: { increment: 1 },
        },
      });
    }

    await tx.paymentAllocation.deleteMany({
      where: { paymentId: existing.id },
    });

    await tx.payment.update({
      where: { id: existing.id },
      data: {
        isVoided: true,
        voidedById: actorUserId,
        voidReason: reason.trim(),
        voidedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'payment.voided',
        entityType: 'Payment',
        entityId: existing.id,
        beforeData: {
          customerName: existing.customer.name,
          amountKes: toNumber(existing.amountKes),
          method: existing.method,
        },
        afterData: {
          isVoided: true,
          voidReason: reason.trim(),
        },
        req,
      },
      tx,
    );
  });

  const balances = await computeCustomerBalances(farmId, [existing.customerId]);

  return {
    voided: true,
    paymentId: existing.id,
    customerBalance: balances.get(existing.customerId) ?? null,
  };
}
