import { Router } from 'express';
import {
  authenticate,
  requireFarmMembership,
  requirePermission,
} from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import {
  auditLogsQuerySchema,
  inviteAssistantSchema,
  updateMemberPermissionsSchema,
  updateMemberStatusSchema,
} from './users.schema';
import {
  createAssistantInvitation,
  listAuditLogs,
  listFarmInvitations,
  listFarmMembers,
  revokeInvitation,
  updateAssistantPermissions,
  updateMemberStatus,
} from './users.service';

export const farmMembersRouter = Router({ mergeParams: true });

farmMembersRouter.use(authenticate, requireFarmMembership);

farmMembersRouter.get('/members', requirePermission('users.manage'), async (req, res, next) => {
  try {
    const members = await listFarmMembers(req.farmContext!.farmId);
    return sendSuccess(res, { members });
  } catch (err) {
    next(err);
  }
});

farmMembersRouter.post(
  '/members/invitations',
  requirePermission('users.manage'),
  validate(inviteAssistantSchema),
  async (req, res, next) => {
    try {
      const invitation = await createAssistantInvitation(
        req.farmContext!.farmId,
        req.user!.id,
        req.body,
        req,
      );
      return sendSuccess(res, { invitation }, 201);
    } catch (err) {
      next(err);
    }
  },
);

farmMembersRouter.get(
  '/members/invitations',
  requirePermission('users.manage'),
  async (req, res, next) => {
    try {
      const invitations = await listFarmInvitations(req.farmContext!.farmId);
      return sendSuccess(res, { invitations });
    } catch (err) {
      next(err);
    }
  },
);

farmMembersRouter.delete(
  '/members/invitations/:invitationId',
  requirePermission('users.manage'),
  async (req, res, next) => {
    try {
      const invitationId = Array.isArray(req.params.invitationId)
        ? req.params.invitationId[0]
        : req.params.invitationId;
      const result = await revokeInvitation(
        req.farmContext!.farmId,
        invitationId,
        req.user!.id,
        req,
      );
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

farmMembersRouter.patch(
  '/members/:membershipId/permissions',
  requirePermission('users.manage'),
  validate(updateMemberPermissionsSchema),
  async (req, res, next) => {
    try {
      const membershipId = Array.isArray(req.params.membershipId)
        ? req.params.membershipId[0]
        : req.params.membershipId;
      const member = await updateAssistantPermissions(
        req.farmContext!.farmId,
        membershipId,
        req.user!.id,
        req.body.permissions,
        req,
      );
      return sendSuccess(res, { member });
    } catch (err) {
      next(err);
    }
  },
);

farmMembersRouter.patch(
  '/members/:membershipId/status',
  requirePermission('users.manage'),
  validate(updateMemberStatusSchema),
  async (req, res, next) => {
    try {
      const membershipId = Array.isArray(req.params.membershipId)
        ? req.params.membershipId[0]
        : req.params.membershipId;
      const result = await updateMemberStatus(
        req.farmContext!.farmId,
        membershipId,
        req.user!.id,
        req.body.status,
        req,
      );
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

farmMembersRouter.get(
  '/audit-logs',
  requirePermission('audit.view'),
  validate(auditLogsQuerySchema),
  async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 25);
      const result = await listAuditLogs(req.farmContext!.farmId, page, limit);
      return sendSuccess(res, { auditLogs: result.items }, 200, {
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  },
);
