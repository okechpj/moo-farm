import { MilkingSession } from '@prisma/client';
import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format');

export const createMilkSchema = z.object({
  body: z.object({
    id: z.string().uuid().optional(),
    animalId: z.string().uuid('Select a valid cow'),
    recordDate: dateStr.optional(),
    session: z.nativeEnum(MilkingSession),
    quantityLitres: z.coerce.number().positive('Milk quantity must be greater than 0').max(200),
    homeUseLitres: z.coerce.number().min(0).max(200).default(0),
    soldLitres: z.coerce.number().min(0).max(200).default(0),
    spoiledLitres: z.coerce.number().min(0).max(200).default(0),
    notes: z.string().trim().max(500).optional().nullable().or(z.literal('')),
  }),
});

export const correctMilkSchema = z.object({
  body: z.object({
    quantityLitres: z.coerce.number().positive('Milk quantity must be greater than 0').max(200),
    homeUseLitres: z.coerce.number().min(0).max(200).default(0),
    soldLitres: z.coerce.number().min(0).max(200).default(0),
    spoiledLitres: z.coerce.number().min(0).max(200).default(0),
    notes: z.string().trim().max(500).optional().nullable().or(z.literal('')),
    correctionReason: z.string().trim().min(3, 'Please explain why this record is being corrected').max(255),
  }),
});

export const listMilkQuerySchema = z.object({
  query: z.object({
    animalId: z.string().uuid().optional(),
    from: dateStr.optional(),
    to: dateStr.optional(),
    session: z.nativeEnum(MilkingSession).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(60),
  }),
});

export const milkSummaryQuerySchema = z.object({
  query: z.object({
    animalId: z.string().uuid().optional(),
    days: z.coerce.number().int().min(7).max(90).default(14),
  }),
});
