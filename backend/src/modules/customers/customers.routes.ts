import { Router } from 'express';
import { CustomerStatus } from '@prisma/client';
import {
  authenticate,
  requireFarmMembership,
  requirePermission,
} from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getParamString } from '../../utils/numbers';
import { sendSuccess } from '../../utils/response';
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './customers.schema';
import {
  createCustomer,
  getCustomerById,
  getCustomerStatement,
  listCustomers,
  updateCustomer,
} from './customers.service';

export const customersRouter = Router({ mergeParams: true });

customersRouter.use(authenticate, requireFarmMembership);

customersRouter.get(
  '/',
  requirePermission('customers.view'),
  validate(listCustomersQuerySchema),
  async (req, res, next) => {
    try {
      const includeBalances = req.farmContext!.permissions.has('payments.view');
      const customers = await listCustomers(req.farmContext!.farmId, {
        status: req.query.status as CustomerStatus | undefined,
        includeBalances,
      });
      return sendSuccess(res, { customers });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/',
  requirePermission('customers.manage'),
  validate(createCustomerSchema),
  async (req, res, next) => {
    try {
      const customer = await createCustomer(
        req.farmContext!.farmId,
        req.user!.id,
        req.body,
        req,
      );
      return sendSuccess(res, { customer }, 201);
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  '/:customerId',
  requirePermission('customers.view'),
  async (req, res, next) => {
    try {
      const includeBalances = req.farmContext!.permissions.has('payments.view');
      const customer = await getCustomerById(
        req.farmContext!.farmId,
        getParamString(req.params.customerId),
        includeBalances,
      );
      return sendSuccess(res, { customer });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.patch(
  '/:customerId',
  requirePermission('customers.manage'),
  validate(updateCustomerSchema),
  async (req, res, next) => {
    try {
      const customer = await updateCustomer(
        req.farmContext!.farmId,
        getParamString(req.params.customerId),
        req.user!.id,
        req.body,
        req,
      );
      return sendSuccess(res, { customer });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  '/:customerId/statement',
  requirePermission('payments.view'),
  async (req, res, next) => {
    try {
      const statement = await getCustomerStatement(
        req.farmContext!.farmId,
        getParamString(req.params.customerId),
      );
      return sendSuccess(res, statement);
    } catch (err) {
      next(err);
    }
  },
);
