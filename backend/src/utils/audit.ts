import { Prisma, PrismaClient } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../config/prisma';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AuditLogInput {
  farmId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  req?: Request;
  extraMeta?: Record<string, unknown>;
}

export async function recordAuditLog(
  input: AuditLogInput,
  client: DbClient = prisma,
): Promise<void> {
  const metadata: Record<string, unknown> = {
    ...(input.extraMeta ?? {}),
  };

  if (input.req) {
    metadata.ip = input.req.ip;
    metadata.userAgent = input.req.get('user-agent') ?? null;
    metadata.method = input.req.method;
    metadata.path = input.req.originalUrl;
  }

  await client.auditLog.create({
    data: {
      farmId: input.farmId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeData: input.beforeData !== undefined ? (input.beforeData as Prisma.InputJsonValue) : Prisma.JsonNull,
      afterData: input.afterData !== undefined ? (input.afterData as Prisma.InputJsonValue) : Prisma.JsonNull,
      metadata: Object.keys(metadata).length > 0 ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}
