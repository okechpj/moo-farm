import { z } from 'zod';

export const createFarmSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Farm name must be at least 2 characters').max(120),
    location: z.string().trim().max(160).optional().or(z.literal('')),
    milkDropAlertThresholdPct: z.coerce.number().min(5).max(80).optional(),
    milkDropBaselineDays: z.coerce.number().int().min(3).max(30).optional(),
  }),
});

export const updateFarmSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    location: z.string().trim().max(160).nullable().optional(),
    milkDropAlertThresholdPct: z.coerce.number().min(5).max(80).optional(),
    milkDropBaselineDays: z.coerce.number().int().min(3).max(30).optional(),
  }),
});
