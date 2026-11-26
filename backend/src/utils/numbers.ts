import { Prisma } from '@prisma/client';

export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toCents(value: Prisma.Decimal | number | string): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function getParamString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
