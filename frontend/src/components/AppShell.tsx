import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Droplets,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Milk,
  Settings,
  Users,
  Wallet,
  Wheat,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useT } from '../i18n/translations';
import { apiRequest } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';
import { Badge, InitialsAvatar } from './ui';

interface NavItem {
  key: string;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: string;
  mobilePrimary?: boolean;
  phaseReady: boolean;
}

export function AppShell() {
  const t = useT();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const activeFarmId = useAuthStore((s) => s.activeFarmId);
  const setActiveFarmId = useAuthStore((s) => s.setActiveFarmId);
  const isOnline = useAuthStore((s) => s.isOnline);
  const clearSession = useAuthStore((s) => s.clearSession);
  const activeMembership = useAuthStore((s) => s.getActiveMembership());

  const perms = new Set(activeMembership?.permissions ?? []);

  const allNavItems: NavItem[] = [
    { key: 'dashboard', to: '/', label: t.nav.dashboard, icon: LayoutDashboard, permission: 'farm.view', mobilePrimary: true, phaseReady: true },
    { key: 'cows', to: '/cows', label: t.nav.cows, icon: Milk, permission: 'animals.view', phaseReady: true },
    { key: 'milk', to: '/milk', label: t.nav.milk, icon: Droplets, permission: 'milk.view', mobilePrimary: true, phaseReady: true },
    { key: 'customers', to: '/customers', label: t.nav.customers, icon: Users, permission: 'customers.view', mobilePrimary: true, phaseReady: true },
    { key: 'health', to: '/health', label: t.nav.health, icon: HeartPulse, permission: 'health.view', mobilePrimary: true, phaseReady: false },
    { key: 'expenses', to: '/expenses', label: t.nav.expenses, icon: Wallet, permission: 'expenses.view', phaseReady: false },
    { key: 'feed', to: '/feed', label: t.nav.feed, icon: Wheat, permission: 'feed.view', phaseReady: false },
    { key: 'reports', to: '/reports', label: t.nav.reports, icon: BarChart3, permission: 'reports.view', phaseReady: false },
    { key: 'settings', to: '/settings', label: t.nav.settings, icon: Settings, permission: 'farm.view', phaseReady: true },
  ];

  const visibleNavItems = allNavItems.filter((item) => perms.has(item.permission));
  const mobilePrimaryItems = visibleNavItems.filter((i) => i.mobilePrimary).slice(0, 4);

  async function handleLogout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Clear local session even if offline
    }
    clearSession();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-[#f6f9f4] text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-68 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="p-5 border-b border-slate-100">
          <Link to="/" className="flex items-center gap-3">
            <img src="/icon.svg" alt="Moo Farm" className="h-10 w-10 rounded-xl" />
            <div>
              <p className="text-lg font-extrabold text-[#1b6b3a] leading-tight">{t.appName}</p>
              <p className="text-xs text-slate-500">
                {activeMembership ? activeMembership.farm.name : t.tagline}
              </p>
            </div>
          </Link>

          {memberships.length > 1 && (
            <div className="mt-4">
              <label htmlFor="desktop-farm-switch" className="sr-only">
                Switch Farm
              </label>
              <select
                id="desktop-farm-switch"
                value={activeFarmId ?? ''}
                onChange={(e) => setActiveFarmId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800"
              >
                {memberships.map((m) => (
                  <option key={m.farmId} value={m.farmId}>
                    {m.farm.name} ({m.role.code === 'FARM_OWNER' ? t.roles.FARM_OWNER : t.roles.FARM_ASSISTANT})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Main navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#e6f2ea] text-[#14532d]'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  {item.label}
                </span>
                {!item.phaseReady && (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    Next
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-3">
          {user && (
            <div className="flex items-center gap-3">
              <InitialsAvatar name={user.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{user.fullName}</p>
                <p className="truncate text-xs text-slate-500">{user.phone}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            {t.auth.logout}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-68 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur px-4 py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg lg:hidden" />
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-slate-900">
                  {activeMembership?.farm.name ?? t.appName}
                </p>
                {activeMembership && (
                  <p className="text-xs text-slate-500">
                    {activeMembership.role.code === 'FARM_OWNER'
                      ? t.roles.FARM_OWNER
                      : t.roles.FARM_ASSISTANT}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {memberships.length > 1 && (
                <select
                  aria-label="Select active farm"
                  value={activeFarmId ?? ''}
                  onChange={(e) => setActiveFarmId(e.target.value)}
                  className="lg:hidden max-w-[140px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-800"
                >
                  {memberships.map((m) => (
                    <option key={m.farmId} value={m.farmId}>
                      {m.farm.name}
                    </option>
                  ))}
                </select>
              )}

              <Badge tone={isOnline ? 'green' : 'amber'}>
                {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {isOnline ? t.online : t.offline}
              </Badge>
            </div>
          </div>
        </header>

        {/* Page Outlet */}
        <main className="flex-1 px-4 py-5 pb-24 lg:pb-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white safe-bottom"
      >
        <div className="grid grid-cols-5 px-1 pt-1.5">
          {mobilePrimaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold ${
                    isActive ? 'text-[#1b6b3a]' : 'text-slate-500'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-[68px]">{item.label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600"
          >
            <Menu className="h-5 w-5" />
            <span>{t.nav.more}</span>
          </button>
        </div>
      </nav>

      {/* Mobile Full Menu Sheet */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/45">
          <div className="rounded-t-3xl bg-white p-5 max-h-[85vh] overflow-y-auto safe-bottom">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                {user && <InitialsAvatar name={user.fullName} size="sm" />}
                <div>
                  <p className="font-bold text-slate-900">{user?.fullName}</p>
                  <p className="text-xs text-slate-500">{user?.phone}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.key}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl border p-3.5 text-sm font-semibold ${
                        isActive
                          ? 'border-[#1b6b3a] bg-[#e6f2ea] text-[#14532d]'
                          : 'border-slate-200 bg-white text-slate-800'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700"
            >
              <LogOut className="h-4 w-4" />
              {t.auth.logout}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
