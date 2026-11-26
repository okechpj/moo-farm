import { Router } from 'express';
import { MilkingSession } from '@prisma/client';
import {
  authenticate,
  requireFarmMembership,
  requirePermission,
} from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getParamString } from '../../utils/numbers';
import { sendSuccess } from '../../utils/response';
import {
  correctMilkSchema,
  createMilkSchema,
  listMilkQuerySchema,
  milkSummaryQuerySchema,
} from './milk.schema';
import {
  correctMilkRecord,
  createMilkRecord,
  getMilkSummary,
  getSupplyBalance,
  listMilkRecords,
} from './milk.service';

export const milkRouter = Router({ mergeParams: true });

milkRouter.use(authenticate, requireFarmMembership);

milkRouter.get(
  '/',
  requirePermission('milk.view'),
  validate(listMilkQuerySchema),
  async (req, res, next) => {
    try {
      const records = await listMilkRecords(req.farmContext!.farmId, {
        animalId: req.query.animalId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        session: req.query.session as MilkingSession | undefined,
        limit: Number(req.query.limit ?? 60),
      });
      return sendSuccess(res, { records });
    } catch (err) {
      next(err);
    }
  },
);

milkRouter.post(
  '/',
  requirePermission('milk.create'),
  validate(createMilkSchema),
  async (req, res, next) => {
    try {
      const record = await createMilkRecord(req.farmContext!.farmId, req.user!.id, req.body, req);
      return sendSuccess(res, { record }, 201);
    } catch (err) {
      next(err);
    }
  },
);

milkRouter.post(
  '/:recordId/correct',
  requirePermission('milk.update'),
  validate(correctMilkSchema),
  async (req, res, next) => {
    try {
      const record = await correctMilkRecord(
        req.farmContext!.farmId,
        getParamString(req.params.recordId),
        req.user!.id,
        req.body,
        req,
      );
      return sendSuccess(res, { record });
    } catch (err) {
      next(err);
    }
  },
);

milkRouter.get(
  '/summary',
  requirePermission('milk.view'),
  validate(milkSummaryQuerySchema),
  async (req, res, next) => {
    try {
      const summary = await getMilkSummary(req.farmContext!.farmId, {
        animalId: req.query.animalId as string | undefined,
        days: Number(req.query.days ?? 14),
      });
      return sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  },
);

milkRouter.get('/supply-balance', requirePermission('milk.view'), async (req, res, next) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const supplyBalance = await getSupplyBalance(req.farmContext!.farmId, date);
    return sendSuccess(res, supplyBalance);
  } catch (err) {
    next(err);
  }
});
