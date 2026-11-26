import { Router } from 'express';
import { AnimalStatus } from '@prisma/client';
import {
  authenticate,
  requireFarmMembership,
  requirePermission,
} from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getParamString } from '../../utils/numbers';
import { sendSuccess } from '../../utils/response';
import {
  createAnimalSchema,
  listAnimalsQuerySchema,
  updateAnimalSchema,
} from './animals.schema';
import {
  archiveAnimal,
  createAnimal,
  getAnimalById,
  listAnimals,
  updateAnimal,
} from './animals.service';

export const animalsRouter = Router({ mergeParams: true });

animalsRouter.use(authenticate, requireFarmMembership);

animalsRouter.get(
  '/',
  requirePermission('animals.view'),
  validate(listAnimalsQuerySchema),
  async (req, res, next) => {
    try {
      const includeFinancials = req.farmContext!.permissions.has('expenses.view');
      const animals = await listAnimals(req.farmContext!.farmId, {
        status: req.query.status as AnimalStatus | undefined,
        includeArchived: Boolean(req.query.includeArchived),
        includeFinancials,
      });
      return sendSuccess(res, { animals });
    } catch (err) {
      next(err);
    }
  },
);

animalsRouter.post(
  '/',
  requirePermission('animals.create'),
  validate(createAnimalSchema),
  async (req, res, next) => {
    try {
      const animal = await createAnimal(req.farmContext!.farmId, req.user!.id, req.body, req);
      return sendSuccess(res, { animal }, 201);
    } catch (err) {
      next(err);
    }
  },
);

animalsRouter.get('/:animalId', requirePermission('animals.view'), async (req, res, next) => {
  try {
    const includeFinancials = req.farmContext!.permissions.has('expenses.view');
    const animal = await getAnimalById(
      req.farmContext!.farmId,
      getParamString(req.params.animalId),
      includeFinancials,
    );
    return sendSuccess(res, { animal });
  } catch (err) {
    next(err);
  }
});

animalsRouter.patch(
  '/:animalId',
  requirePermission('animals.update'),
  validate(updateAnimalSchema),
  async (req, res, next) => {
    try {
      const animal = await updateAnimal(
        req.farmContext!.farmId,
        getParamString(req.params.animalId),
        req.user!.id,
        req.body,
        req,
      );
      return sendSuccess(res, { animal });
    } catch (err) {
      next(err);
    }
  },
);

animalsRouter.post(
  '/:animalId/archive',
  requirePermission('animals.archive'),
  async (req, res, next) => {
    try {
      const result = await archiveAnimal(
        req.farmContext!.farmId,
        getParamString(req.params.animalId),
        req.user!.id,
        req,
      );
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);
