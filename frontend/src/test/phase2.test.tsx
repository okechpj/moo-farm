import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { formatLitres } from '../lib/formatters';
import { CowsPage } from '../pages/CowsPage';
import { CustomersPage } from '../pages/CustomersPage';
import { useAuthStore } from '../stores/authStore';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Phase 2 Frontend Utilities & Permission-Aware Operations UI', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('formats litres cleanly', () => {
    expect(formatLitres(12)).toBe('12 L');
    expect(formatLitres(12.5)).toBe('12.5 L');
    expect(formatLitres(12.25)).toBe('12.25 L');
  });

  it('displays cow initials avatar on CowsPage and hides Add/Edit/Archive from Farm Assistants', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'test-token',
      user: {
        id: 'u-asst',
        fullName: 'Peter Kamau',
        phone: '+254722111222',
        email: null,
        accountType: 'ASSISTANT',
        preferredLocale: 'en',
      },
      memberships: [
        {
          membershipId: 'm-1',
          farmId: 'f-1',
          farm: {
            id: 'f-1',
            name: 'Kiambu Dairy',
            location: 'Limuru',
            timezone: 'Africa/Nairobi',
            currency: 'KES',
            milkDropAlertThresholdPct: 20,
            milkDropBaselineDays: 7,
          },
          role: { code: 'FARM_ASSISTANT', name: 'Farm Assistant' },
          permissions: ['farm.view', 'animals.view', 'milk.create'],
          joinedAt: new Date().toISOString(),
        },
      ],
      configurablePermissions: [],
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          animals: [
            {
              id: 'a-1',
              farmId: 'f-1',
              name: 'Black Beauty',
              tagNumber: 'KE-001',
              breed: 'Friesian',
              dateOfBirth: null,
              photoUrl: null,
              origin: 'PURCHASED',
              acquiredDate: null,
              purchasePriceKes: null,
              status: 'MILKING',
              notes: null,
              archivedAt: null,
              todayLitres: 18.5,
              version: 1,
            },
          ],
        },
      }),
    } as Response);

    renderWithProviders(<CowsPage />);

    await waitFor(() => {
      expect(screen.getByText('Black Beauty')).toBeInTheDocument();
    });
    expect(screen.getByText('BB')).toBeInTheDocument();
    expect(screen.getByText('18.5 L')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Cow/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archive/i })).not.toBeInTheDocument();
  });

  it('hides Payments tab and Add Customer button on CustomersPage for Assistants without payment permissions', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'test-token',
      user: {
        id: 'u-asst',
        fullName: 'Peter Kamau',
        phone: '+254722111222',
        email: null,
        accountType: 'ASSISTANT',
        preferredLocale: 'en',
      },
      memberships: [
        {
          membershipId: 'm-1',
          farmId: 'f-1',
          farm: {
            id: 'f-1',
            name: 'Kiambu Dairy',
            location: 'Limuru',
            timezone: 'Africa/Nairobi',
            currency: 'KES',
            milkDropAlertThresholdPct: 20,
            milkDropBaselineDays: 7,
          },
          role: { code: 'FARM_ASSISTANT', name: 'Farm Assistant' },
          permissions: ['farm.view', 'customers.view', 'deliveries.view', 'deliveries.create'],
          joinedAt: new Date().toISOString(),
        },
      ],
      configurablePermissions: [],
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('daily-checklist')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              date: '2026-11-26',
              supplyBalance: {
                date: '2026-11-26',
                totalProducedLitres: 20,
                homeUseLitres: 2,
                spoiledLitres: 0,
                withheldLitres: 0,
                availableForSaleLitres: 18,
                totalCustomerDemandLitres: 10,
                deliveredLitres: 0,
                pendingDeliveryLitres: 0,
                unfulfilledDemandLitres: 10,
                supplyShortageLitres: 0,
                isSupplyShortage: false,
              },
              checklist: [],
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { customers: [] } }),
      } as Response;
    });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('Daily Deliveries')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Payments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Customer/i })).not.toBeInTheDocument();
  });
});
