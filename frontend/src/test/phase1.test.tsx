import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { formatKes, getInitials } from '../lib/formatters';
import { LoginPage } from '../pages/LoginPage';
import { UpcomingModulePage } from '../pages/UpcomingModulePage';
import { useAuthStore } from '../stores/authStore';

describe('Phase 1 Frontend Utilities', () => {
  it('generates cow and user initials cleanly', () => {
    expect(getInitials('Daisy')).toBe('DA');
    expect(getInitials('Black Beauty')).toBe('BB');
    expect(getInitials('  Grace   Wanjiku  ')).toBe('GW');
    expect(getInitials('')).toBe('?');
  });

  it('formats KES currency values cleanly', () => {
    expect(formatKes(1250)).toContain('1,250.00');
  });
});

describe('Phase 1 Auth & Permission-Aware UI', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    useAuthStore.getState().setLocale('en');
  });

  it('renders phone-first LoginPage with owner registration and assistant invite links', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText(/New Farm Owner/i)).toBeInTheDocument();
    expect(screen.getByText(/Join as Farm Assistant/i)).toBeInTheDocument();
  });

  it('hides owner-only navigation items (Expenses, Reports) from Farm Assistants', () => {
    useAuthStore.getState().setSession({
      accessToken: 'test-token',
      user: {
        id: 'u-assistant',
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
            name: 'Kiambu Green Dairy',
            location: 'Limuru',
            timezone: 'Africa/Nairobi',
            currency: 'KES',
            milkDropAlertThresholdPct: 20,
            milkDropBaselineDays: 7,
          },
          role: { code: 'FARM_ASSISTANT', name: 'Farm Assistant' },
          permissions: ['farm.view', 'animals.view', 'milk.view', 'customers.view', 'health.view'],
          joinedAt: new Date().toISOString(),
        },
      ],
      configurablePermissions: [],
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div>Dashboard Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Milk Records').length).toBeGreaterThan(0);
    expect(screen.queryByText('Expenses')).not.toBeInTheDocument();
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
  });

  it('shows Expenses and Reports navigation items to Farm Owners', () => {
    useAuthStore.getState().setSession({
      accessToken: 'test-token',
      user: {
        id: 'u-owner',
        fullName: 'Grace Wanjiku',
        phone: '+254711111222',
        email: 'grace@example.com',
        accountType: 'OWNER',
        preferredLocale: 'en',
      },
      memberships: [
        {
          membershipId: 'm-owner',
          farmId: 'f-1',
          farm: {
            id: 'f-1',
            name: 'Kiambu Green Dairy',
            location: 'Limuru',
            timezone: 'Africa/Nairobi',
            currency: 'KES',
            milkDropAlertThresholdPct: 20,
            milkDropBaselineDays: 7,
          },
          role: { code: 'FARM_OWNER', name: 'Farm Owner' },
          permissions: [
            'farm.view',
            'animals.view',
            'milk.view',
            'customers.view',
            'health.view',
            'expenses.view',
            'feed.view',
            'reports.view',
          ],
          joinedAt: new Date().toISOString(),
        },
      ],
      configurablePermissions: [],
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div>Dashboard Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Expenses').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reports').length).toBeGreaterThan(0);
  });

  it('blocks direct route access when user lacks required permission', () => {
    useAuthStore.getState().setSession({
      accessToken: 'test-token',
      user: {
        id: 'u-assistant',
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
            name: 'Kiambu Green Dairy',
            location: 'Limuru',
            timezone: 'Africa/Nairobi',
            currency: 'KES',
            milkDropAlertThresholdPct: 20,
            milkDropBaselineDays: 7,
          },
          role: { code: 'FARM_ASSISTANT', name: 'Farm Assistant' },
          permissions: ['farm.view'],
          joinedAt: new Date().toISOString(),
        },
      ],
      configurablePermissions: [],
    });

    render(
      <MemoryRouter>
        <UpcomingModulePage
          title="Expenses & Finances"
          phase="Phase 3"
          description="Expenses"
          requiredPermission="expenses.view"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
  });
});
