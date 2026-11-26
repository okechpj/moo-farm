import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimiter';
import { validate } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import {
  acceptInvitationSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from './auth.schema';
import {
  acceptAssistantInvitation,
  clearRefreshTokenCookie,
  getConfigurablePermissionsMetadata,
  getUserMembershipsPayload,
  loginUser,
  logoutSession,
  REFRESH_COOKIE_NAME,
  refreshSession,
  registerOwner,
  setRefreshTokenCookie,
} from './auth.service';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const result = await registerOwner(req.body, req);
    setRefreshTokenCookie(res, result.rawRefreshToken);
    return sendSuccess(
      res,
      {
        accessToken: result.accessToken,
        user: result.user,
        memberships: result.memberships,
        configurablePermissions: getConfigurablePermissionsMetadata(),
      },
      201,
    );
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', authRateLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const result = await loginUser(req.body, req);
    setRefreshTokenCookie(res, result.rawRefreshToken);
    return sendSuccess(res, {
      accessToken: result.accessToken,
      user: result.user,
      memberships: result.memberships,
      configurablePermissions: getConfigurablePermissionsMetadata(),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  '/invitations/accept',
  authRateLimiter,
  validate(acceptInvitationSchema),
  async (req, res, next) => {
    try {
      const result = await acceptAssistantInvitation(req.body, req);
      setRefreshTokenCookie(res, result.rawRefreshToken);
      return sendSuccess(
        res,
        {
          accessToken: result.accessToken,
          user: result.user,
          memberships: result.memberships,
          configurablePermissions: getConfigurablePermissionsMetadata(),
        },
        201,
      );
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post('/refresh', authRateLimiter, async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const result = await refreshSession(rawToken);
    setRefreshTokenCookie(res, result.rawRefreshToken);
    return sendSuccess(res, {
      accessToken: result.accessToken,
      user: result.user,
      memberships: result.memberships,
      configurablePermissions: getConfigurablePermissionsMetadata(),
    });
  } catch (err) {
    clearRefreshTokenCookie(res);
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await logoutSession(rawToken, req.user?.id, req);
    clearRefreshTokenCookie(res);
    return sendSuccess(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const memberships = await getUserMembershipsPayload(req.user!.id);
    return sendSuccess(res, {
      user: req.user,
      memberships,
      configurablePermissions: getConfigurablePermissionsMetadata(),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.patch('/me', authenticate, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(req.body.fullName !== undefined ? { fullName: req.body.fullName } : {}),
        ...(req.body.preferredLocale !== undefined
          ? { preferredLocale: req.body.preferredLocale }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        accountType: true,
        preferredLocale: true,
      },
    });
    return sendSuccess(res, { user: updated });
  } catch (err) {
    next(err);
  }
});
