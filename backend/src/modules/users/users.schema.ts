import { z } from 'zod';
import { MembershipStatus } from '@prisma/client';

export const inviteAssistantSchema = z.object({
  body: z.object({
    phone: z.string().trim().min(9, 'Enter a valid Kenyan phone number').max(25),
    inviteeName: z.string().trim().min(2).max(120).optional().or(z.literal('')),
    grantedPermissions: z.array(z.string()).default([]),
  }),
});

export const updateMemberPermissionsSchema = z.object({
  body: z.object({
    permissions: z.record(z.string(), z.boolean()),
  }),
});

export const updateMemberStatusSchema = z.object({
  body: z.object({
    status: z.enum([MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.REMOVED]),
  }),
});

export const auditLogsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }),
});
