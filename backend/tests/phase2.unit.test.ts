import { PaymentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { evaluateCowDropAlert } from '../src/modules/milk/milk.analytics';
import { planFifoPaymentAllocations } from '../src/modules/payments/payments.service';

describe('Milk production drop alert evaluation', () => {
  it('does not alert when history has fewer than 5 baseline days', () => {
    const alert = evaluateCowDropAlert({
      animalId: 'cow-1',
      animalName: 'Daisy',
      tagNumber: 'KE-001',
      baselineDays: 7,
      thresholdPercent: 20,
      dailySeries: [
        { date: '2026-11-01', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-02', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-03', totalLitres: 10, sessionCount: 2 },
        { date: '2026-11-04', totalLitres: 10, sessionCount: 2 },
      ],
    });
    expect(alert).toBeNull();
  });

  it('does not alert from a single unusual low day', () => {
    const alert = evaluateCowDropAlert({
      animalId: 'cow-1',
      animalName: 'Daisy',
      tagNumber: 'KE-001',
      baselineDays: 7,
      thresholdPercent: 20,
      dailySeries: [
        { date: '2026-11-01', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-02', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-03', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-04', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-05', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-06', totalLitres: 19.5, sessionCount: 2 },
        { date: '2026-11-07', totalLitres: 12, sessionCount: 2 },
      ],
    });
    expect(alert).toBeNull();
  });

  it('alerts when 2 consecutive recent days drop below threshold vs rolling baseline', () => {
    const alert = evaluateCowDropAlert({
      animalId: 'cow-1',
      animalName: 'Daisy',
      tagNumber: 'KE-001',
      baselineDays: 7,
      thresholdPercent: 20,
      dailySeries: [
        { date: '2026-11-01', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-02', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-03', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-04', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-05', totalLitres: 20, sessionCount: 2 },
        { date: '2026-11-06', totalLitres: 15, sessionCount: 2 },
        { date: '2026-11-07', totalLitres: 14, sessionCount: 2 },
      ],
    });
    expect(alert).not.toBeNull();
    expect(alert!.baselineAvgLitres).toBe(20);
    expect(alert!.recentAvgLitres).toBe(14.5);
    expect(alert!.dropPercent).toBe(27.5);
  });
});

describe('FIFO payment allocation planner', () => {
  it('allocates across oldest deliveries first and sets PAID / PARTIALLY_PAID accurately', () => {
    const plan = planFifoPaymentAllocations(75000, [
      { id: 'd1', totalCents: 50000, paidCents: 0 },
      { id: 'd2', totalCents: 40000, paidCents: 10000 },
      { id: 'd3', totalCents: 30000, paidCents: 0 },
    ]);

    expect(plan.allocations).toEqual([
      {
        milkDeliveryId: 'd1',
        allocatedCents: 50000,
        newPaidCents: 50000,
        newPaymentStatus: PaymentStatus.PAID,
      },
      {
        milkDeliveryId: 'd2',
        allocatedCents: 25000,
        newPaidCents: 35000,
        newPaymentStatus: PaymentStatus.PARTIALLY_PAID,
      },
    ]);
    expect(plan.unallocatedCents).toBe(0);
  });

  it('tracks overpayment as unallocated credit cents', () => {
    const plan = planFifoPaymentAllocations(60000, [
      { id: 'd1', totalCents: 45000, paidCents: 0 },
    ]);
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].newPaymentStatus).toBe(PaymentStatus.PAID);
    expect(plan.unallocatedCents).toBe(15000);
  });
});
