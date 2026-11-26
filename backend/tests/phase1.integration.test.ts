import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { seedRbac } from '../prisma/seed';

const app = createApp();

// Unique Kenyan test numbers per test run so reruns never collide
const suffix = String(Math.floor(100000 + Math.random() * 899999));
const ownerAPhone = `071${suffix.slice(0, 7)}`.padEnd(10, '1');
const ownerAEmail = `owner.a.${suffix}@moofarm.test`;
const assistantAPhone = `072${suffix.slice(0, 7)}`.padEnd(10, '2');
const ownerBPhone = `073${suffix.slice(0, 7)}`.padEnd(10, '3');

const createdUserIds: string[] = [];
const createdFarmIds: string[] = [];

describe('Phase 1 Integration: Auth, RBAC, Assistant Phone Login & Multi-Farm Isolation', () => {
  let ownerAToken = '';
  let farmAId = '';
  let secondFarmAId = '';
  let assistantAToken = '';
  let assistantAMembershipId = '';
  let inviteCode = '';
  let ownerBToken = '';
  let farmBId = '';

  beforeAll(async () => {
    await seedRbac(prisma);
  });

  afterAll(async () => {
    // Clean up test data in FK-safe order
    if (createdFarmIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { farmId: { in: createdFarmIds } } });
      await prisma.farmInvitation.deleteMany({ where: { farmId: { in: createdFarmIds } } });
      await prisma.farmMembership.deleteMany({ where: { farmId: { in: createdFarmIds } } });
      await prisma.farm.deleteMany({ where: { id: { in: createdFarmIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it('registers Farm Owner A with Kenyan phone, email, and initial farm', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Grace Wanjiku',
        phone: ownerAPhone,
        email: ownerAEmail,
        password: 'Password123!',
        farmName: 'Kiambu Green Dairy',
        farmLocation: 'Limuru, Kiambu',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.phone).toMatch(/^\+2547/);
    expect(res.body.data.user.accountType).toBe('OWNER');
    expect(res.body.data.memberships).toHaveLength(1);
    expect(res.body.data.memberships[0].role.code).toBe('FARM_OWNER');
    expect(res.body.data.memberships[0].farm.timezone).toBe('Africa/Nairobi');
    expect(res.body.data.memberships[0].farm.currency).toBe('KES');
    expect(res.headers['set-cookie']).toBeDefined();

    ownerAToken = res.body.data.accessToken;
    farmAId = res.body.data.memberships[0].farmId;
    createdUserIds.push(res.body.data.user.id);
    createdFarmIds.push(farmAId);
  });

  it('supports login with phone number, email, refresh rotation, and reuse detection', async () => {
    // Login with phone
    const loginPhoneRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: ownerAPhone, password: 'Password123!' });
    expect(loginPhoneRes.status).toBe(200);

    const firstCookie = loginPhoneRes.headers['set-cookie'];
    expect(firstCookie).toBeDefined();

    // Rotate refresh token
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeTruthy();
    const secondCookie = refreshRes.headers['set-cookie'];

    // Replaying the already-rotated first refresh token must fail (reuse detection)
    const replayRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie);
    expect(replayRes.status).toBe(401);

    // Because reuse revoked the entire family, the second cookie must now also be rejected
    const familyRevokedRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', secondCookie);
    expect(familyRevokedRes.status).toBe(401);

    // Login with email also works for owner
    const loginEmailRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: ownerAEmail, password: 'Password123!' });
    expect(loginEmailRes.status).toBe(200);
    ownerAToken = loginEmailRes.body.data.accessToken;
  });

  it('allows Farm Owner A to create a second farm and update farm settings', async () => {
    const createRes = await request(app)
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ name: 'Nakuru Annex Farm', location: 'Naivasha' });

    expect(createRes.status).toBe(201);
    secondFarmAId = createRes.body.data.farm.id;
    createdFarmIds.push(secondFarmAId);

    const patchRes = await request(app)
      .patch(`/api/v1/farms/${farmAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ milkDropAlertThresholdPct: 25, milkDropBaselineDays: 10 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.farm.milkDropAlertThresholdPct).toBe(25);
    expect(patchRes.body.data.farm.milkDropBaselineDays).toBe(10);
  });

  it('invites a Farm Assistant by phone number and blocks non-configurable owner permissions', async () => {
    // Attempt to grant owner-only permission must fail
    const badInvite = await request(app)
      .post(`/api/v1/farms/${farmAId}/members/invitations`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        phone: assistantAPhone,
        inviteeName: 'Peter Kamau',
        grantedPermissions: ['expenses.view'],
      });
    expect(badInvite.status).toBe(400);

    // Valid invitation with phone number only
    const res = await request(app)
      .post(`/api/v1/farms/${farmAId}/members/invitations`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        phone: assistantAPhone,
        inviteeName: 'Peter Kamau',
        grantedPermissions: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.invitation.inviteCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    inviteCode = res.body.data.invitation.inviteCode;
  });

  it('lets the Farm Assistant join via phone + invite code (no email) and enforces strict RBAC', async () => {
    const joinRes = await request(app)
      .post('/api/v1/auth/invitations/accept')
      .send({
        phone: assistantAPhone,
        inviteCode,
        fullName: 'Peter Kamau',
        password: 'AssistantPass123!',
      });

    expect(joinRes.status).toBe(201);
    expect(joinRes.body.data.user.email).toBeNull();
    expect(joinRes.body.data.user.accountType).toBe('ASSISTANT');
    expect(joinRes.body.data.memberships[0].role.code).toBe('FARM_ASSISTANT');
    expect(joinRes.body.data.memberships[0].permissions).toContain('milk.create');
    expect(joinRes.body.data.memberships[0].permissions).not.toContain('payments.create');
    expect(joinRes.body.data.memberships[0].permissions).not.toContain('expenses.view');
    expect(joinRes.body.data.memberships[0].permissions).not.toContain('reports.view');

    assistantAToken = joinRes.body.data.accessToken;
    assistantAMembershipId = joinRes.body.data.memberships[0].membershipId;
    createdUserIds.push(joinRes.body.data.user.id);

    // Assistant logs in with phone number
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: assistantAPhone, password: 'AssistantPass123!' });
    expect(loginRes.status).toBe(200);
    assistantAToken = loginRes.body.data.accessToken;

    // Assistant CAN view dashboard, but owner-only sections (audit + pending invites) are hidden
    const dashRes = await request(app)
      .get(`/api/v1/farms/${farmAId}/dashboard`)
      .set('Authorization', `Bearer ${assistantAToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.recentActivity).toBeNull();
    expect(dashRes.body.data.team.pendingInvitationsCount).toBeNull();

    // Assistant MUST NOT create a farm
    const createFarmRes = await request(app)
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({ name: 'Unauthorized Farm' });
    expect(createFarmRes.status).toBe(403);

    // Assistant MUST NOT update or archive farm
    const patchFarmRes = await request(app)
      .patch(`/api/v1/farms/${farmAId}`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({ name: 'Hacked Farm' });
    expect(patchFarmRes.status).toBe(403);

    const deleteFarmRes = await request(app)
      .delete(`/api/v1/farms/${farmAId}`)
      .set('Authorization', `Bearer ${assistantAToken}`);
    expect(deleteFarmRes.status).toBe(403);

    // Assistant MUST NOT view members, invite users, or view audit logs
    const membersRes = await request(app)
      .get(`/api/v1/farms/${farmAId}/members`)
      .set('Authorization', `Bearer ${assistantAToken}`);
    expect(membersRes.status).toBe(403);

    const auditRes = await request(app)
      .get(`/api/v1/farms/${farmAId}/audit-logs`)
      .set('Authorization', `Bearer ${assistantAToken}`);
    expect(auditRes.status).toBe(403);
  });

  it('lets Owner toggle configurable assistant permissions and suspend/reactivate assistant', async () => {
    // Owner enables payments.create for assistant
    const grantRes = await request(app)
      .patch(`/api/v1/farms/${farmAId}/members/${assistantAMembershipId}/permissions`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ permissions: { 'payments.create': true } });

    expect(grantRes.status).toBe(200);
    expect(grantRes.body.data.member.effectivePermissions).toContain('payments.create');

    // Assistant sees updated permission via /auth/me
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${assistantAToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.memberships[0].permissions).toContain('payments.create');

    // Owner suspends assistant -> immediate 403 on farm endpoints
    const suspendRes = await request(app)
      .patch(`/api/v1/farms/${farmAId}/members/${assistantAMembershipId}/status`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ status: 'SUSPENDED' });
    expect(suspendRes.status).toBe(200);

    const blockedRes = await request(app)
      .get(`/api/v1/farms/${farmAId}/dashboard`)
      .set('Authorization', `Bearer ${assistantAToken}`);
    expect(blockedRes.status).toBe(403);

    // Reactivate assistant -> access restored
    await request(app)
      .patch(`/api/v1/farms/${farmAId}/members/${assistantAMembershipId}/status`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ status: 'ACTIVE' });

    const restoredRes = await request(app)
      .get(`/api/v1/farms/${farmAId}/dashboard`)
      .set('Authorization', `Bearer ${assistantAToken}`);
    expect(restoredRes.status).toBe(200);
  });

  it('enforces strict farm-level data isolation across separate farms', async () => {
    const regB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Samuel Kiprop',
        phone: ownerBPhone,
        password: 'OwnerBPassword123!',
        farmName: 'Eldoret Valley Dairy',
      });
    expect(regB.status).toBe(201);
    ownerBToken = regB.body.data.accessToken;
    farmBId = regB.body.data.memberships[0].farmId;
    createdUserIds.push(regB.body.data.user.id);
    createdFarmIds.push(farmBId);

    // Owner A cannot read or edit Farm B
    expect(
      (
        await request(app)
          .get(`/api/v1/farms/${farmBId}`)
          .set('Authorization', `Bearer ${ownerAToken}`)
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .patch(`/api/v1/farms/${farmBId}`)
          .set('Authorization', `Bearer ${ownerAToken}`)
          .send({ name: 'Cross-Tenant Tamper' })
      ).status,
    ).toBe(403);

    // Assistant of Farm A cannot read Farm B or Owner A's second farm
    expect(
      (
        await request(app)
          .get(`/api/v1/farms/${farmBId}/dashboard`)
          .set('Authorization', `Bearer ${assistantAToken}`)
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .get(`/api/v1/farms/${secondFarmAId}/dashboard`)
          .set('Authorization', `Bearer ${assistantAToken}`)
      ).status,
    ).toBe(403);

    // Owner B cannot view Farm A audit logs
    expect(
      (
        await request(app)
          .get(`/api/v1/farms/${farmAId}/audit-logs`)
          .set('Authorization', `Bearer ${ownerBToken}`)
      ).status,
    ).toBe(403);

    // Owner A CAN view Farm A audit logs and sees recorded activity
    const auditA = await request(app)
      .get(`/api/v1/farms/${farmAId}/audit-logs`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(auditA.status).toBe(200);
    expect(auditA.body.data.auditLogs.length).toBeGreaterThanOrEqual(4);
  });
});
