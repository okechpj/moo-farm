import { CustomerStatus } from '@prisma/client';
import { z } from 'zod';

export const createCustomerSchema = z.object({
  body: z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, 'Customer name is required').max(120),
    phone: z.string().trim().min(9, 'Enter a valid Kenyan phone number').max(25),
    location: z.string().trim().max(160).optional().nullable().or(z.literal('')),
    agreedPricePerLitre: z.coerce
      .number()
      .positive('Agreed price per litre (KES) must be greater than 0')
      .max(10000),
    expectedDailyLitres: z.coerce.number().min(0).max(500).default(0),
    agreementNotes: z.string().trim().max(500).optional().nullable().or(z.literal('')),
    status: z.nativeEnum(CustomerStatus).default(CustomerStatus.ACTIVE),
  }),
});

export const updateCustomerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(9).max(25).optional(),
    location: z.string().trim().max(160).optional().nullable().or(z.literal('')),
    agreedPricePerLitre: z.coerce.number().positive().max(10000).optional(),
    expectedDailyLitres: z.coerce.number().min(0).max(500).optional(),
    agreementNotes: z.string().trim().max(500).optional().nullable().or(z.literal('')),
    status: z.nativeEnum(CustomerStatus).optional(),
  }),
});

export const listCustomersQuerySchema = z.object({
  query: z.object({
    status: z.nativeEnum(CustomerStatus).optional(),
  }),
});
