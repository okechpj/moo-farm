import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format');

export const createPaymentSchema = z.object({
  body: z.object({
    id: z.string().uuid().optional(),
    customerId: z.string().uuid('Select a valid customer'),
    paymentDate: dateStr.optional(),
    amountKes: z.coerce.number().positive('Payment amount (KES) must be greater than 0').max(99999999),
    method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
    referenceCode: z.string().trim().max(80).optional().nullable().or(z.literal('')),
    notes: z.string().trim().max(500).optional().nullable().or(z.literal('')),
    targetDeliveryId: z.string().uuid().optional(),
  }),
});

export const voidPaymentSchema = z.object({
  body: z.object({
    reason: z.string().trim().min(3, 'Please provide a reason for voiding this payment').max(255),
  }),
});

export const listPaymentsQuerySchema = z.object({
  query: z.object({
    customerId: z.string().uuid().optional(),
    from: dateStr.optional(),
    to: dateStr.optional(),
    includeVoided: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    limit: z.coerce.number().int().min(1).max(200).default(80),
  }),
});
