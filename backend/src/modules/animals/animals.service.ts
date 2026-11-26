import { AnimalOrigin, AnimalStatus } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { recordAuditLog } from '../../utils/audit';
import { formatDateOnly, getNairobiDateString, parseDateOnly } from '../../utils/date';
import { Errors } from '../../utils/errors';
import { round2, toNumber } from '../../utils/numbers';

function serializeAnimal(
  animal: {
    id: string;
    farmId: string;
    name: string;
    tagNumber: string;
    breed: string;
    dateOfBirth: Date | null;
    photoUrl: string | null;
    origin: AnimalOrigin;
    acquiredDate: Date | null;
    purchasePriceKes: unknown;
    status: AnimalStatus;
    notes: string | null;
    archivedAt: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  },
  includeFinancials: boolean,
  todayLitres?: number,
) {
  return {
    id: animal.id,
    farmId: animal.farmId,
    name: animal.name,
    tagNumber: animal.tagNumber,
    breed: animal.breed,
    dateOfBirth: animal.dateOfBirth ? formatDateOnly(animal.dateOfBirth) : null,
    photoUrl: animal.photoUrl,
    origin: animal.origin,
    acquiredDate: animal.acquiredDate ? formatDateOnly(animal.acquiredDate) : null,
    purchasePriceKes:
      includeFinancials && animal.purchasePriceKes !== null
        ? toNumber(animal.purchasePriceKes as never)
        : null,
    status: animal.status,
    notes: animal.notes,
    archivedAt: animal.archivedAt,
    version: animal.version,
    createdAt: animal.createdAt,
    updatedAt: animal.updatedAt,
    ...(todayLitres !== undefined ? { todayLitres: round2(todayLitres) } : {}),
  };
}

export async function listAnimals(
  farmId: string,
  options: { status?: AnimalStatus; includeArchived?: boolean; includeFinancials: boolean },
) {
  const todayDate = parseDateOnly(getNairobiDateString());

  const [animals, todayMilk] = await Promise.all([
    prisma.animal.findMany({
      where: {
        farmId,
        ...(options.includeArchived ? {} : { archivedAt: null }),
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.milkProduction.groupBy({
      by: ['animalId'],
      where: {
        farmId,
        recordDate: todayDate,
        isSuperseded: false,
      },
      _sum: { quantityLitres: true },
    }),
  ]);

  const todayByAnimal = new Map<string, number>(
    todayMilk.map((m) => [m.animalId, toNumber(m._sum.quantityLitres)]),
  );

  return animals.map((a) =>
    serializeAnimal(a, options.includeFinancials, todayByAnimal.get(a.id) ?? 0),
  );
}

export async function getAnimalById(
  farmId: string,
  animalId: string,
  includeFinancials: boolean,
) {
  const animal = await prisma.animal.findFirst({
    where: { id: animalId, farmId },
  });

  if (!animal) {
    throw Errors.notFound('Cow profile not found');
  }

  const recentMilk = await prisma.milkProduction.findMany({
    where: { farmId, animalId, isSuperseded: false },
    orderBy: [{ recordDate: 'desc' }, { session: 'desc' }],
    take: 14,
    include: {
      recordedBy: { select: { id: true, fullName: true } },
    },
  });

  const todayStr = getNairobiDateString();
  const todayLitres = recentMilk
    .filter((r) => formatDateOnly(r.recordDate) === todayStr)
    .reduce((sum, r) => sum + toNumber(r.quantityLitres), 0);

  return {
    ...serializeAnimal(animal, includeFinancials, todayLitres),
    recentMilk: recentMilk.map((r) => ({
      id: r.id,
      recordDate: formatDateOnly(r.recordDate),
      session: r.session,
      quantityLitres: toNumber(r.quantityLitres),
      homeUseLitres: toNumber(r.homeUseLitres),
      soldLitres: toNumber(r.soldLitres),
      spoiledLitres: toNumber(r.spoiledLitres),
      notes: r.notes,
      recordedByName: r.recordedBy.fullName,
    })),
  };
}

export async function createAnimal(
  farmId: string,
  actorUserId: string,
  input: {
    id?: string;
    name: string;
    tagNumber: string;
    breed: string;
    dateOfBirth?: string | null;
    origin: AnimalOrigin;
    acquiredDate?: string | null;
    purchasePriceKes?: number | null;
    status: AnimalStatus;
    notes?: string | null;
  },
  req: Request,
) {
  const normalizedTag = input.tagNumber.trim().toUpperCase();

  const existingTag = await prisma.animal.findUnique({
    where: { farmId_tagNumber: { farmId, tagNumber: normalizedTag } },
  });
  if (existingTag) {
    throw Errors.conflict(`A cow with tag number "${normalizedTag}" already exists on this farm.`);
  }

  const created = await prisma.$transaction(async (tx) => {
    const animal = await tx.animal.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        farmId,
        name: input.name.trim(),
        tagNumber: normalizedTag,
        breed: input.breed.trim(),
        dateOfBirth: input.dateOfBirth ? parseDateOnly(input.dateOfBirth, 'dateOfBirth') : null,
        origin: input.origin,
        acquiredDate: input.acquiredDate ? parseDateOnly(input.acquiredDate, 'acquiredDate') : null,
        purchasePriceKes:
          input.origin === AnimalOrigin.PURCHASED && input.purchasePriceKes !== undefined
            ? input.purchasePriceKes
            : null,
        status: input.status,
        notes: input.notes?.trim() || null,
        createdById: actorUserId,
      },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'animal.created',
        entityType: 'Animal',
        entityId: animal.id,
        afterData: {
          name: animal.name,
          tagNumber: animal.tagNumber,
          breed: animal.breed,
          status: animal.status,
        },
        req,
      },
      tx,
    );

    return animal;
  });

  return serializeAnimal(created, true, 0);
}

export async function updateAnimal(
  farmId: string,
  animalId: string,
  actorUserId: string,
  input: {
    name?: string;
    tagNumber?: string;
    breed?: string;
    dateOfBirth?: string | null;
    origin?: AnimalOrigin;
    acquiredDate?: string | null;
    purchasePriceKes?: number | null;
    status?: AnimalStatus;
    notes?: string | null;
  },
  req: Request,
) {
  const existing = await prisma.animal.findFirst({
    where: { id: animalId, farmId, archivedAt: null },
  });
  if (!existing) {
    throw Errors.notFound('Cow profile not found');
  }

  const nextTag = input.tagNumber ? input.tagNumber.trim().toUpperCase() : undefined;
  if (nextTag && nextTag !== existing.tagNumber) {
    const duplicate = await prisma.animal.findUnique({
      where: { farmId_tagNumber: { farmId, tagNumber: nextTag } },
    });
    if (duplicate) {
      throw Errors.conflict(`Another cow already has tag number "${nextTag}".`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const animal = await tx.animal.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(nextTag !== undefined ? { tagNumber: nextTag } : {}),
        ...(input.breed !== undefined ? { breed: input.breed.trim() } : {}),
        ...(input.dateOfBirth !== undefined
          ? { dateOfBirth: input.dateOfBirth ? parseDateOnly(input.dateOfBirth, 'dateOfBirth') : null }
          : {}),
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.acquiredDate !== undefined
          ? { acquiredDate: input.acquiredDate ? parseDateOnly(input.acquiredDate, 'acquiredDate') : null }
          : {}),
        ...(input.purchasePriceKes !== undefined ? { purchasePriceKes: input.purchasePriceKes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ? input.notes.trim() : null } : {}),
        version: { increment: 1 },
      },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'animal.updated',
        entityType: 'Animal',
        entityId: animal.id,
        beforeData: {
          name: existing.name,
          tagNumber: existing.tagNumber,
          status: existing.status,
        },
        afterData: {
          name: animal.name,
          tagNumber: animal.tagNumber,
          status: animal.status,
        },
        req,
      },
      tx,
    );

    return animal;
  });

  return serializeAnimal(updated, true);
}

export async function archiveAnimal(
  farmId: string,
  animalId: string,
  actorUserId: string,
  req: Request,
) {
  const existing = await prisma.animal.findFirst({
    where: { id: animalId, farmId, archivedAt: null },
  });
  if (!existing) {
    throw Errors.notFound('Cow profile not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.animal.update({
      where: { id: existing.id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });

    await recordAuditLog(
      {
        farmId,
        actorUserId,
        action: 'animal.archived',
        entityType: 'Animal',
        entityId: existing.id,
        beforeData: { name: existing.name, tagNumber: existing.tagNumber },
        req,
      },
      tx,
    );
  });

  return { archived: true, animalId: existing.id };
}
