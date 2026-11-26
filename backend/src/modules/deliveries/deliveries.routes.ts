import { Router } from 'express';
import { DeliveryStatus } from '@prisma/client';
import {
  authenticate,
  requireFarmMembership,
  requirePermission,
} from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getParamString } from '../../utils/numbers';
import { sendSuccess } from '../../utils/response';
import {
  createDeliverySchema,
  listDeliveriesQuerySchema,
  updateDeliverySchema,
} from './deliveries.schema';
import {
  createDelivery,
  getDailyDeliveryChecklist,
  listDeliveries,
  updateDelivery,
} from './deliveries.service';

export const deliveriesRouter = Router({ mergeParams: true });

deliveriesRouter.use(authenticate, requireFarmMembership);

deliveriesRouter.get(
  '/',
  requirePermission('deliveries.view'),
  validate(listDeliveriesQuerySchema),
  async (req, res, next) => {
    try {
      const deliveries = await listDeliveries(req.farmContext!.farmId, {
        date: req.query.date as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        customerId: req.query.customerId as string | undefined,
        deliveryStatus: req.query.deliveryStatus as DeliveryStatus | undefined,
        limit: Number(req.query.limit ?? 80),
      });
      return sendSuccess(res, { deliveries });
    } catch (err) {
      next(err);
    }
  },
);

deliveriesRouter.get(
  '/daily-checklist',
  requirePermission('deliveries.view'),
  async (req, res, next) => {
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const result = await getDailyDeliveryChecklist(req.farmContext!.farmId, date);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

deliveriesRouter.post(
  '/',
  requirePermission('deliveries.create'),
  validate(createDeliverySchema),
  async (req, res, next) => {
    try {
      const delivery = await createDelivery(
        req.farmContext!.farmId,
        req.user!.id,
        req.body,
        req,
      );
      return sendSuccess(res, { delivery }, 201);
    } catch (err) {
      next(err);
    }
  },
);

deliveriesRouter.patch(
  '/:deliveryId',
  requirePermission('deliveries.update'),
  validate(updateDeliverySchema),
  async (req, res, next) => {
    try {
      const delivery = await updateDelivery(
        req.farmContext!.farmId,
        getParamString(req.params.deliveryId),
        req.user!.id,
        req.body,
        req,
      );
      return sendSuccess(res, { delivery });
    } catch (err) {
      next(err);
    }
  },
);
