import { DeliveryStatus } from '@prisma/client';
import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format');

export const createDeliverySchema = z.object({
  body: z.object({
    id: z.string().uuid().optional(),
    customerId: z.string().uuid('Select a valid customer'),
    deliveryDate: dateStr.optional(),
    quantityLitres: z.coerce.number().positive('Quantity must be greater than 0').max(500),
    deliveryStatus: z.enum([DeliveryStatus.DELIVERED, DeliveryStatus.PENDING]).default(DeliveryStatus.DELIVERED),
    notes: z.string().trim().max(500).optional().nullable().or(z.literal('')),
  }),
});

export const updateDeliverySchema = z.object({
  body: z.object({
    quantityLitres: z.coerce.number().positive().max(500).optional(),
    deliveryStatus: z.nativeEnum(DeliveryStatus).optional(),
    notes: z.string().trim().max(500).optional().nullable().or(z.literal('')),
  }),
});

export const listDeliveriesQuerySchema = z.object({
  query: z.object({
    date: dateStr.optional(),
    from: dateStr.optional(),
    to: dateStr.optional(),
    customerId: z.string().uuid().optional(),
    deliveryStatus: z.nativeEnum(DeliveryStatus).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(80),
  }),
});
