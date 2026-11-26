import { AnimalOrigin, AnimalStatus } from '@prisma/client';
import { z } from 'zod';

const optionalDateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format')
  .optional()
  .nullable()
  .or(z.literal(''));

export const createAnimalSchema = z.object({
  body: z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Cow name is required').max(100),
    tagNumber: z.string().trim().min(1, 'Unique tag number is required').max(50),
    breed: z.string().trim().min(1, 'Breed is required').max(80),
    dateOfBirth: optionalDateStr,
    origin: z.nativeEnum(AnimalOrigin).default(AnimalOrigin.PURCHASED),
    acquiredDate: optionalDateStr,
    purchasePriceKes: z.coerce.number().min(0).max(99999999).optional().nullable(),
    status: z.nativeEnum(AnimalStatus).default(AnimalStatus.MILKING),
    notes: z.string().trim().max(500).optional().nullable().or(z.literal('')),
  }),
});

export const updateAnimalSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    tagNumber: z.string().trim().min(1).max(50).optional(),
    breed: z.string().trim().min(1).max(80).optional(),
    dateOfBirth: optionalDateStr,
    origin: z.nativeEnum(AnimalOrigin).optional(),
    acquiredDate: optionalDateStr,
    purchasePriceKes: z.coerce.number().min(0).max(99999999).optional().nullable(),
    status: z.nativeEnum(AnimalStatus).optional(),
    notes: z.string().trim().max(500).optional().nullable().or(z.literal('')),
  }),
});

export const listAnimalsQuerySchema = z.object({
  query: z.object({
    status: z.nativeEnum(AnimalStatus).optional(),
    includeArchived: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  }),
});
