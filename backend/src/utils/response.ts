import { Response } from 'express';
import { DEFAULT_TIMEZONE, getNairobiDateString } from './date';

export interface ApiSuccessMeta {
  serverTime: string;
  nairobiDate: string;
  timezone: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  extraMeta?: Partial<ApiSuccessMeta>,
): Response {
  const now = new Date();
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      serverTime: now.toISOString(),
      nairobiDate: getNairobiDateString(now),
      timezone: DEFAULT_TIMEZONE,
      ...extraMeta,
    },
  });
}
