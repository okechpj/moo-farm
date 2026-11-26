import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';
import { animalsRouter } from './modules/animals/animals.routes';
import { authRouter } from './modules/auth/auth.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { deliveriesRouter } from './modules/deliveries/deliveries.routes';
import { farmsRouter } from './modules/farms/farms.routes';
import { milkRouter } from './modules/milk/milk.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { farmMembersRouter } from './modules/users/users.routes';
import { Errors } from './utils/errors';
import { sendSuccess } from './utils/response';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      }),
    );
  }

  app.use('/api/v1', apiRateLimiter);

  app.get('/api/v1/health', (_req, res) => {
    sendSuccess(res, {
      status: 'ok',
      service: 'moo-farm-api',
      version: 'v1',
    });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/farms', farmsRouter);
  app.use('/api/v1/farms/:farmId', farmMembersRouter);
  app.use('/api/v1/farms/:farmId/animals', animalsRouter);
  app.use('/api/v1/farms/:farmId/milk', milkRouter);
  app.use('/api/v1/farms/:farmId/customers', customersRouter);
  app.use('/api/v1/farms/:farmId/deliveries', deliveriesRouter);
  app.use('/api/v1/farms/:farmId/payments', paymentsRouter);

  app.use((_req, _res, next) => {
    next(Errors.notFound('API endpoint not found'));
  });

  app.use(errorHandler);

  return app;
}
