import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(120),
    phone: z.string().trim().min(9, 'Enter a valid phone number').max(25),
    email: z
      .string()
      .trim()
      .email('Enter a valid email address')
      .max(255)
      .optional()
      .or(z.literal('')),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    farmName: z.string().trim().min(2, 'Farm name must be at least 2 characters').max(120).optional().or(z.literal('')),
    farmLocation: z.string().trim().max(160).optional().or(z.literal('')),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().trim().min(3, 'Enter your phone number or email'),
    password: z.string().min(1, 'Password is required'),
    deviceLabel: z.string().trim().max(150).optional(),
  }),
});

export const acceptInvitationSchema = z.object({
  body: z.object({
    phone: z.string().trim().min(9, 'Enter your phone number').max(25),
    inviteCode: z.string().trim().min(8, 'Enter the 8-character invite code').max(12),
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(120),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    deviceLabel: z.string().trim().max(150).optional(),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2).max(120).optional(),
    preferredLocale: z.enum(['en', 'sw']).optional(),
  }),
});
