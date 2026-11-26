import { Router } from 'express';
import {
  authenticate,
  requireFarmMembership,
  requireOwnerAccount,
  requirePermission,
} from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import { getUserMembershipsPayload } from '../auth/auth.service';
import { createFarmSchema, updateFarmSchema } from './farms.schema';
import {
  archiveFarm,
  createFarm,
  getFarmById,
  getFarmDashboard,
  updateFarm,
} from './farms.service';

export const farmsRouter = Router();

farmsRouter.use(authenticate);

farmsRouter.get('/', async (req, res, next) => {
  try {
    const memberships = await getUserMembershipsPayload(req.user!.id);
    return sendSuccess(res, { farms: memberships });
  } catch (err) {
    next(err);
  }
});

farmsRouter.post('/', requireOwnerAccount, validate(createFarmSchema), async (req, res, next) => {
  try {
    const farm = await createFarm(req.user!.id, req.body, req);
    return sendSuccess(res, { farm }, 201);
  } catch (err) {
    next(err);
  }
});

farmsRouter.get(
  '/:farmId',
  requireFarmMembership,
  requirePermission('farm.view'),
  async (req, res, next) => {
    try {
      const farm = await getFarmById(req.farmContext!.farmId);
      return sendSuccess(res, {
        farm,
        role: {
          code: req.farmContext!.roleCode,
          name: req.farmContext!.roleName,
        },
        permissions: Array.from(req.farmContext!.permissions).sort(),
      });
    } catch (err) {
      next(err);
    }
  },
);

farmsRouter.patch(
  '/:farmId',
  requireFarmMembership,
  requirePermission('farm.manage'),
  validate(updateFarmSchema),
  async (req, res, next) => {
    try {
      const farm = await updateFarm(req.farmContext!.farmId, req.user!.id, req.body, req);
      return sendSuccess(res, { farm });
    } catch (err) {
      next(err);
    }
  },
);

farmsRouter.delete(
  '/:farmId',
  requireFarmMembership,
  requirePermission('farm.manage'),
  async (req, res, next) => {
    try {
      const result = await archiveFarm(req.farmContext!.farmId, req.user!.id, req);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

farmsRouter.get(
  '/:farmId/dashboard',
  requireFarmMembership,
  requirePermission('farm.view'),
  async (req, res, next) => {
    try {
      const dashboard = await getFarmDashboard(
        req.farmContext!.farmId,
        req.farmContext!.roleCode,
        req.farmContext!.roleName,
        req.farmContext!.permissions,
      );
      return sendSuccess(res, dashboard);
    } catch (err) {
      next(err);
    }
  },
);
