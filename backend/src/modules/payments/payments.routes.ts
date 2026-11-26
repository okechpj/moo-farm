import { Router } from 'express';
import {
  authenticate,
  requireFarmMembership,
  requirePermission,
} from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getParamString } from '../../utils/numbers';
import { sendSuccess } from '../../utils/response';
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
  voidPaymentSchema,
} from './payments.schema';
import { listPayments, recordPayment, voidPayment } from './payments.service';

export const paymentsRouter = Router({ mergeParams: true });

paymentsRouter.use(authenticate, requireFarmMembership);

paymentsRouter.get(
  '/',
  requirePermission('payments.view'),
  validate(listPaymentsQuerySchema),
  async (req, res, next) => {
    try {
      const payments = await listPayments(req.farmContext!.farmId, {
        customerId: req.query.customerId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        includeVoided: Boolean(req.query.includeVoided),
        limit: Number(req.query.limit ?? 80),
      });
      return sendSuccess(res, { payments });
    } catch (err) {
      next(err);
    }
  },
);

paymentsRouter.post(
  '/',
  requirePermission('payments.create'),
  validate(createPaymentSchema),
  async (req, res, next) => {
    try {
      const result = await recordPayment(req.farmContext!.farmId, req.user!.id, req.body, req);
      return sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

paymentsRouter.post(
  '/:paymentId/void',
  requirePermission('payments.manage'),
  validate(voidPaymentSchema),
  async (req, res, next) => {
    try {
      const result = await voidPayment(
        req.farmContext!.farmId,
        getParamString(req.params.paymentId),
        req.user!.id,
        req.body.reason,
        req,
      );
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);
