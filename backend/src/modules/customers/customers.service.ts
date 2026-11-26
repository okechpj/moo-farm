import { CustomerStatus, DeliveryStatus } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { recordAuditLog } from '../../utils/audit';
import { formatDateOnly } from '../../utils/date';
import { Errors } from '../../utils/errors';
import { fromCents, round2, toCents, toNumber } from '../../utils/numbers';
import { normalizePhoneNumber } from '../../utils/phone';

export interface CustomerBalanceSummary {
  totalBilledKes: number;
  totalPaidKes: number;
  outstandingBalanceKes: number;
  creditBalanceKes: number;
}

export async function computeCustomerBalances(
  farmId: string,
  customerIds?: string[],
): Promise<Map<string, CustomerBalanceSummary>> {
  const deliveryWhere = {
    farmId,
    deliveryStatus: DeliveryStatus.DELIVERED,
    ...(customerIds ? { customerId: { in: customerIds } } : {}),
  };
  const paymentWhere = {
    farmId,
    isVoided: false,
    ...(customerIds ? { customerId: { in: customerIds } } : {}),
  };

  const [deliverySums, paymentSums] = await Promise.all([
    prisma.milkDelivery.groupBy({
      by: ['customerId'],
      where: deliveryWhere,
      _sum: { totalAmountKes: true },
    }),
    prisma.payment.groupBy({
      by: ['customerId'],
      where: paymentWhere,
      _sum: { amountKes: true },
    }),
  ]);

  const billedMap = new Map<string, number>(
    deliverySums.map((d) => [d.customerId, toCents(d._sum.totalAmountKes ?? 0)]),
  );
  const paidMap = new Map<string, number>(
    paymentSums.map((p) => [p.customerId, toCents(p._sum.amountKes ?? 0)]),
  );

  const allIds = new Set<string>([
    ...(customerIds ?? []),
    ...billedMap.keys(),
    ...paidMap.keys(),
  ]);

  const result = new Map<string, CustomerBalanceSummary>();
  for (const id of allIds) {
    const billedCents = billedMap.get(id) ?? 0;
    const paidCents = paidMap.get(id) ?? 0;
    const outstandingCents = Math.max(0, billedCents - paidCents);
    const creditCents = Math.max(0, paidCents - billedCents);
    result.set(id, {
      totalBilledKes: fromCents(billedCents),
      totalPaidKes: fromCents(paidCents),
      outstandingBalanceKes: fromCents(outstandingCents),
      creditBalanceKes: fromCents(creditCents),
    });
  }

  return result;
}

export async function listCustomers(
  farmId: string,
  options: { status?: CustomerStatus; includeBalances: boolean },
) {
  const customers = await prisma.customer.findMany({
    where: {
      farmId,
      archivedAt: null,
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });

  const balances = options.includeBalances
    ? await computeCustomerBalances(
        farmId,
        customers.map((c) => c.id),
      )
    : null;

  return customers.map((c) => {
    const bal = balances?.get(c.id);
    return {
      id: c.id,
      farmId: c.farmId,
      name: c.name,
      phone: c.phone,
      location: c.location,
      agreedPricePerLitre: toNumber(c.agreedPricePerLitre),
      expectedDailyLitres: toNumber(c.expectedDailyLitres),
      agreementNotes: c.agreementNotes,
      status: c.status,
      balance: bal ?? null,
      version: c.version,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  });
}

export async function getCustomerById(
  farmId: string,
  customerId: string,
  includeBalances: boolean,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, farmId, archivedAt: null },
  });
  if (!customer) {
    throw Errors.notFound('Customer not found');
  }

  const balances = includeBalances ? await computeCustomerBalances(farmId, [customer.id]) : null;
  const recentDeliveries = await prisma.milkDelivery.findMany({
    where: { farmId, customerId: customer.id },
    orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
    take: 15,
  });

  return {
    id: customer.id,
    farmId: customer.farmId,
    name: customer.name,
    phone: customer.phone,
    location: customer.location,
    agreedPricePerLitre: toNumber(customer.agreedPricePerLitre),
    expectedDailyLitres: toNumber(customer.expectedDailyLitres),
    agreementNotes: customer.agreementNotes,
    status: customer.status,
    balance: balances?.get(customer.id) ?? null,
    recentDeliveries: recentDeliveries.map((d) => ({
      id: d.id,
      deliveryDate: formatDateOnly(d.deliveryDate),
      quantityLitres: toNumber(d.quantityLitres),
      unitPriceKes: toNumber(d.unitPriceKes),
      totalAmountKes: toNumber(d.totalAmountKes),
      paidAmountKes: toNumber(d.paidAmountKes),
      deliveryStatus: d.deliveryStatus,
      paymentStatus: d.paymentStatus,
      notes: d.notes,
    })),
    version: customer.version,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export async function createCustomer(
  farmId: string,
  actorUserId: string,
  input: {
    id?: string;
    name: string;
    phone: string;
    location?: string | null;
    agreedPricePerLitre: number;
    expectedDailyLitres: number;
    agreementNotes?: string | null;
    status: CustomerStatus;
  },
  req: Request,
) {
  const normalizedPhone = normalizePhoneNumber(input.phone);

  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        farmId,
        name: input.name.trim(),
        phone: normalizedPhone,
        location: input.location?.trim() || null,
        agreedPricePerLitre: round2(input.agreedPricePerLitre),
        expectedDailyLitres: round2(input.expectedDailyLitres),
        agreementNotes: input.agreementNotes?.trim() || null,
        status: input.status,
        createdById: actorUserId,
      },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'customer.created',
        entityType: 'Customer',
        entityId: customer.id,
        afterData: {
          name: customer.name,
          phone: customer.phone,
          agreedPricePerLitre: toNumber(customer.agreedPricePerLitre),
          expectedDailyLitres: toNumber(customer.expectedDailyLitres),
        },
        req,
      },
      tx,
    );

    return customer;
  });

  return {
    id: created.id,
    farmId: created.farmId,
    name: created.name,
    phone: created.phone,
    location: created.location,
    agreedPricePerLitre: toNumber(created.agreedPricePerLitre),
    expectedDailyLitres: toNumber(created.expectedDailyLitres),
    agreementNotes: created.agreementNotes,
    status: created.status,
    balance: {
      totalBilledKes: 0,
      totalPaidKes: 0,
      outstandingBalanceKes: 0,
      creditBalanceKes: 0,
    },
    version: created.version,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

export async function updateCustomer(
  farmId: string,
  customerId: string,
  actorUserId: string,
  input: {
    name?: string;
    phone?: string;
    location?: string | null;
    agreedPricePerLitre?: number;
    expectedDailyLitres?: number;
    agreementNotes?: string | null;
    status?: CustomerStatus;
  },
  req: Request,
) {
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, farmId, archivedAt: null },
  });
  if (!existing) {
    throw Errors.notFound('Customer not found');
  }

  const normalizedPhone = input.phone ? normalizePhoneNumber(input.phone) : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(normalizedPhone !== undefined ? { phone: normalizedPhone } : {}),
        ...(input.location !== undefined
          ? { location: input.location ? input.location.trim() : null }
          : {}),
        ...(input.agreedPricePerLitre !== undefined
          ? { agreedPricePerLitre: round2(input.agreedPricePerLitre) }
          : {}),
        ...(input.expectedDailyLitres !== undefined
          ? { expectedDailyLitres: round2(input.expectedDailyLitres) }
          : {}),
        ...(input.agreementNotes !== undefined
          ? { agreementNotes: input.agreementNotes ? input.agreementNotes.trim() : null }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        version: { increment: 1 },
      },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'customer.updated',
        entityType: 'Customer',
        entityId: customer.id,
        beforeData: {
          name: existing.name,
          agreedPricePerLitre: toNumber(existing.agreedPricePerLitre),
          expectedDailyLitres: toNumber(existing.expectedDailyLitres),
          status: existing.status,
        },
        afterData: {
          name: customer.name,
          agreedPricePerLitre: toNumber(customer.agreedPricePerLitre),
          expectedDailyLitres: toNumber(customer.expectedDailyLitres),
          status: customer.status,
        },
        req,
      },
      tx,
    );

    return customer;
  });

  const balances = await computeCustomerBalances(farmId, [updated.id]);
  return {
    id: updated.id,
    farmId: updated.farmId,
    name: updated.name,
    phone: updated.phone,
    location: updated.location,
    agreedPricePerLitre: toNumber(updated.agreedPricePerLitre),
    expectedDailyLitres: toNumber(updated.expectedDailyLitres),
    agreementNotes: updated.agreementNotes,
    status: updated.status,
    balance: balances.get(updated.id) ?? null,
    version: updated.version,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function getCustomerStatement(farmId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, farmId, archivedAt: null },
  });
  if (!customer) {
    throw Errors.notFound('Customer not found');
  }

  const [deliveries, payments, balances] = await Promise.all([
    prisma.milkDelivery.findMany({
      where: {
        farmId,
        customerId: customer.id,
        deliveryStatus: DeliveryStatus.DELIVERED,
      },
      orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.payment.findMany({
      where: {
        farmId,
        customerId: customer.id,
        isVoided: false,
      },
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
    }),
    computeCustomerBalances(farmId, [customer.id]),
  ]);

  type LedgerEntry = {
    id: string;
    date: string;
    createdAt: Date;
    type: 'DELIVERY' | 'PAYMENT';
    description: string;
    debitKes: number;
    creditKes: number;
    reference: string | null;
  };

  const entries: LedgerEntry[] = [
    ...deliveries.map((d) => ({
      id: d.id,
      date: formatDateOnly(d.deliveryDate),
      createdAt: d.createdAt,
      type: 'DELIVERY' as const,
      description: `Milk delivery (${toNumber(d.quantityLitres)} L @ KES ${toNumber(d.unitPriceKes)}/L)`,
      debitKes: toNumber(d.totalAmountKes),
      creditKes: 0,
      reference: d.paymentStatus,
    })),
    ...payments.map((p) => ({
      id: p.id,
      date: formatDateOnly(p.paymentDate),
      createdAt: p.createdAt,
      type: 'PAYMENT' as const,
      description: `Payment received (${p.method})`,
      debitKes: 0,
      creditKes: toNumber(p.amountKes),
      reference: p.referenceCode ?? null,
    })),
  ].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  let runningCents = 0;
  const lines = entries.map((e) => {
    runningCents += toCents(e.debitKes) - toCents(e.creditKes);
    return {
      id: e.id,
      date: e.date,
      type: e.type,
      description: e.description,
      debitKes: e.debitKes,
      creditKes: e.creditKes,
      reference: e.reference,
      runningBalanceKes: fromCents(runningCents),
    };
  });

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      location: customer.location,
      agreedPricePerLitre: toNumber(customer.agreedPricePerLitre),
      expectedDailyLitres: toNumber(customer.expectedDailyLitres),
    },
    summary: balances.get(customer.id) ?? {
      totalBilledKes: 0,
      totalPaidKes: 0,
      outstandingBalanceKes: 0,
      creditBalanceKes: 0,
    },
    lines,
  };
}
