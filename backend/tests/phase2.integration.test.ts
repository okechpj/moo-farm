import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { seedRbac } from '../prisma/seed';
import { getNairobiDateString } from '../src/utils/date';

const app = createApp();

const suffix = String(Math.floor(100000 + Math.random() * 899999));
const ownerAPhone = `074${suffix.slice(0, 7)}`.padEnd(10, '4');
const assistantAPhone = `075${suffix.slice(0, 7)}`.padEnd(10, '5');
const ownerBPhone = `076${suffix.slice(0, 7)}`.padEnd(10, '6');

const createdUserIds: string[] = [];
const createdFarmIds: string[] = [];

describe('Phase 2 Integration: Cows, Milk, Customers, Deliveries, Payments & RBAC', () => {
  let ownerAToken = '';
  let farmAId = '';
  let assistantAToken = '';
  let assistantAMembershipId = '';
  let ownerBToken = '';

  let cowId = '';
  let morningMilkId = '';
  let customerAId = '';
  let deliveryId = '';
  let secondPaymentId = '';

  const todayStr = getNairobiDateString();

  beforeAll(async () => {
    await seedRbac(prisma);

    const regA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Mary Wambui',
        phone: ownerAPhone,
        password: 'OwnerPassword123!',
        farmName: 'Githunguri Dairy',
        farmLocation: 'Kiambu',
      });
    ownerAToken = regA.body.data.accessToken;
    farmAId = regA.body.data.memberships[0].farmId;
    createdUserIds.push(regA.body.data.user.id);
    createdFarmIds.push(farmAId);

    const inv = await request(app)
      .post(`/api/v1/farms/${farmAId}/members/invitations`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ phone: assistantAPhone, inviteeName: 'John Njoroge', grantedPermissions: [] });

    const join = await request(app)
      .post('/api/v1/auth/invitations/accept')
      .send({
        phone: assistantAPhone,
        inviteCode: inv.body.data.invitation.inviteCode,
        fullName: 'John Njoroge',
        password: 'AssistantPassword123!',
      });
    assistantAToken = join.body.data.accessToken;
    assistantAMembershipId = join.body.data.memberships[0].membershipId;
    createdUserIds.push(join.body.data.user.id);

    const regB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'David Mutua',
        phone: ownerBPhone,
        password: 'OwnerBPassword123!',
        farmName: 'Machakos Dairy',
      });
    ownerBToken = regB.body.data.accessToken;
    createdUserIds.push(regB.body.data.user.id);
    createdFarmIds.push(regB.body.data.memberships[0].farmId);
  });

  afterAll(async () => {
    if (createdFarmIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { farmId: { in: createdFarmIds } } });
      await prisma.farm.deleteMany({ where: { id: { in: createdFarmIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it('manages cow profiles, prevents duplicate tags, and enforces assistant read-only RBAC', async () => {
    const denied = await request(app)
      .post(`/api/v1/farms/${farmAId}/animals`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({ name: 'Daisy', tagNumber: 'KE-001', breed: 'Friesian' });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post(`/api/v1/farms/${farmAId}/animals`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: 'Daisy',
        tagNumber: 'ke-001',
        breed: 'Friesian',
        origin: 'PURCHASED',
        purchasePriceKes: 135000,
        status: 'MILKING',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.animal.tagNumber).toBe('KE-001');
    expect(created.body.data.animal.purchasePriceKes).toBe(135000);
    cowId = created.body.data.animal.id;

    const dup = await request(app)
      .post(`/api/v1/farms/${farmAId}/animals`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ name: 'Bella', tagNumber: 'KE-001', breed: 'Ayrshire' });
    expect(dup.status).toBe(409);

    const asstList = await request(app)
      .get(`/api/v1/farms/${farmAId}/animals`)
      .set('Authorization', `Bearer ${assistantAToken}`);
    expect(asstList.status).toBe(200);
    expect(asstList.body.data.animals).toHaveLength(1);
    expect(asstList.body.data.animals[0].purchasePriceKes).toBeNull();
  });

  it('records morning and evening milk and rejects invalid allocations or duplicate sessions', async () => {
    const badAlloc = await request(app)
      .post(`/api/v1/farms/${farmAId}/milk`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({
        animalId: cowId,
        recordDate: todayStr,
        session: 'MORNING',
        quantityLitres: 10,
        homeUseLitres: 6,
        soldLitres: 6,
      });
    expect(badAlloc.status).toBe(400);

    const am = await request(app)
      .post(`/api/v1/farms/${farmAId}/milk`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({
        animalId: cowId,
        recordDate: todayStr,
        session: 'MORNING',
        quantityLitres: 12.5,
        homeUseLitres: 1.5,
        soldLitres: 10,
        spoiledLitres: 1,
      });
    expect(am.status).toBe(201);
    morningMilkId = am.body.data.record.id;

    const dupAm = await request(app)
      .post(`/api/v1/farms/${farmAId}/milk`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        animalId: cowId,
        recordDate: todayStr,
        session: 'MORNING',
        quantityLitres: 13,
      });
    expect(dupAm.status).toBe(409);

    const pm = await request(app)
      .post(`/api/v1/farms/${farmAId}/milk`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({
        animalId: cowId,
        recordDate: todayStr,
        session: 'EVENING',
        quantityLitres: 9.5,
        homeUseLitres: 0.5,
        soldLitres: 9,
      });
    expect(pm.status).toBe(201);
  });

  it('supports non-destructive milk correction and computes daily/weekly/monthly summaries', async () => {
    const deniedCorrect = await request(app)
      .post(`/api/v1/farms/${farmAId}/milk/${morningMilkId}/correct`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({
        quantityLitres: 13,
        homeUseLitres: 1.5,
        soldLitres: 10.5,
        spoiledLitres: 1,
        correctionReason: 'Recounted bucket',
      });
    expect(deniedCorrect.status).toBe(403);

    const corrected = await request(app)
      .post(`/api/v1/farms/${farmAId}/milk/${morningMilkId}/correct`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        quantityLitres: 13,
        homeUseLitres: 1.5,
        soldLitres: 10.5,
        spoiledLitres: 1,
        correctionReason: 'Verified calibrated jug reading',
      });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data.record.quantityLitres).toBe(13);

    const summary = await request(app)
      .get(`/api/v1/farms/${farmAId}/milk/summary`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data.today.morningLitres).toBe(13);
    expect(summary.body.data.today.eveningLitres).toBe(9.5);
    expect(summary.body.data.today.totalLitres).toBe(22.5);
    expect(summary.body.data.today.availableForSaleLitres).toBe(19.5);
    expect(summary.body.data.weeklyTotalLitres).toBe(22.5);
  });

  it('manages customers, detects supply shortages, and records agreed-price deliveries', async () => {
    const deniedCust = await request(app)
      .post(`/api/v1/farms/${farmAId}/customers`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({
        name: 'Mama Njeri',
        phone: '0711223344',
        agreedPricePerLitre: 65,
        expectedDailyLitres: 10,
      });
    expect(deniedCust.status).toBe(403);

    const custA = await request(app)
      .post(`/api/v1/farms/${farmAId}/customers`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: 'Mama Njeri Shop',
        phone: '0711223344',
        location: 'Githunguri',
        agreedPricePerLitre: 65,
        expectedDailyLitres: 10,
      });
    expect(custA.status).toBe(201);
    customerAId = custA.body.data.customer.id;

    await request(app)
      .post(`/api/v1/farms/${farmAId}/customers`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: 'Kiambu Hotel',
        phone: '0722334455',
        agreedPricePerLitre: 60,
        expectedDailyLitres: 15,
      });

    const supply = await request(app)
      .get(`/api/v1/farms/${farmAId}/milk/supply-balance`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(supply.status).toBe(200);
    expect(supply.body.data.isSupplyShortage).toBe(true);
    expect(supply.body.data.supplyShortageLitres).toBe(5.5);

    const deliv = await request(app)
      .post(`/api/v1/farms/${farmAId}/deliveries`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({
        customerId: customerAId,
        deliveryDate: todayStr,
        quantityLitres: 10,
      });
    expect(deliv.status).toBe(201);
    expect(deliv.body.data.delivery.unitPriceKes).toBe(65);
    expect(deliv.body.data.delivery.totalAmountKes).toBe(650);
    expect(deliv.body.data.delivery.paymentStatus).toBe('UNPAID');
    deliveryId = deliv.body.data.delivery.id;

    const asstCustomers = await request(app)
      .get(`/api/v1/farms/${farmAId}/customers`)
      .set('Authorization', `Bearer ${assistantAToken}`);
    expect(asstCustomers.status).toBe(200);
    expect(asstCustomers.body.data.customers[0].balance).toBeNull();
  });

  it('enforces payment RBAC, allocates FIFO payments, builds statements, and reverses voided payments', async () => {
    const deniedPay = await request(app)
      .post(`/api/v1/farms/${farmAId}/payments`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({ customerId: customerAId, amountKes: 400, method: 'MPESA' });
    expect(deniedPay.status).toBe(403);

    const pay1 = await request(app)
      .post(`/api/v1/farms/${farmAId}/payments`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        customerId: customerAId,
        amountKes: 400,
        method: 'MPESA',
        referenceCode: 'SJK82X9Q1P',
        paymentDate: todayStr,
      });
    expect(pay1.status).toBe(201);
    expect(pay1.body.data.customerBalance.outstandingBalanceKes).toBe(250);

    await request(app)
      .patch(`/api/v1/farms/${farmAId}/members/${assistantAMembershipId}/permissions`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ permissions: { 'payments.create': true, 'payments.view': true } });

    const pay2 = await request(app)
      .post(`/api/v1/farms/${farmAId}/payments`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({
        customerId: customerAId,
        amountKes: 250,
        method: 'CASH',
        paymentDate: todayStr,
      });
    expect(pay2.status).toBe(201);
    expect(pay2.body.data.customerBalance.outstandingBalanceKes).toBe(0);
    secondPaymentId = pay2.body.data.payment.id;

    const stmt = await request(app)
      .get(`/api/v1/farms/${farmAId}/customers/${customerAId}/statement`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(stmt.status).toBe(200);
    expect(stmt.body.data.lines).toHaveLength(3);
    expect(stmt.body.data.lines[0].runningBalanceKes).toBe(650);
    expect(stmt.body.data.lines[1].runningBalanceKes).toBe(250);
    expect(stmt.body.data.lines[2].runningBalanceKes).toBe(0);

    const deniedVoid = await request(app)
      .post(`/api/v1/farms/${farmAId}/payments/${secondPaymentId}/void`)
      .set('Authorization', `Bearer ${assistantAToken}`)
      .send({ reason: 'Mistake' });
    expect(deniedVoid.status).toBe(403);

    const voided = await request(app)
      .post(`/api/v1/farms/${farmAId}/payments/${secondPaymentId}/void`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ reason: 'Duplicate cash entry' });
    expect(voided.status).toBe(200);
    expect(voided.body.data.customerBalance.outstandingBalanceKes).toBe(250);

    const updatedDeliv = await prisma.milkDelivery.findUnique({ where: { id: deliveryId } });
    expect(updatedDeliv?.paymentStatus).toBe('PARTIALLY_PAID');
    expect(Number(updatedDeliv?.paidAmountKes)).toBe(400);
  });

  it('isolates all Phase 2 farm resources from other farm owners', async () => {
    expect(
      (
        await request(app)
          .get(`/api/v1/farms/${farmAId}/animals`)
          .set('Authorization', `Bearer ${ownerBToken}`)
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .get(`/api/v1/farms/${farmAId}/milk`)
          .set('Authorization', `Bearer ${ownerBToken}`)
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .get(`/api/v1/farms/${farmAId}/customers`)
          .set('Authorization', `Bearer ${ownerBToken}`)
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .get(`/api/v1/farms/${farmAId}/payments`)
          .set('Authorization', `Bearer ${ownerBToken}`)
      ).status,
    ).toBe(403);
  });
});
