import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  Banknote,
  Calendar,
  Droplets,
  MapPin,
  Plus,
  Truck,
  UserPlus,
} from 'lucide-react';
import { AlertBanner, Badge, Card, InitialsAvatar } from '../components/ui';
import { useT } from '../i18n/translations';
import { apiRequest } from '../lib/apiClient';
import {
  formatActionLabel,
  formatKes,
  formatLitres,
  formatNairobiDateTime,
} from '../lib/formatters';
import { useAuthStore } from '../stores/authStore';
import { FarmDashboardData } from '../types/api';

export function DashboardPage() {
  const t = useT();
  const activeMembership = useAuthStore((s) => s.getActiveMembership());
  const farmId = activeMembership?.farmId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['farm-dashboard', farmId],
    queryFn: () => apiRequest<FarmDashboardData>(`/farms/${farmId}/dashboard`),
    enabled: Boolean(farmId),
  });

  if (!farmId) {
    return (
      <Card>
        <p className="text-slate-700">No active farm selected.</p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse rounded-2xl bg-white border border-slate-200" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-28 animate-pulse rounded-2xl bg-white border border-slate-200" />
          <div className="h-28 animate-pulse rounded-2xl bg-white border border-slate-200" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <AlertBanner
        tone="error"
        title="Could not load farm dashboard"
        message={error instanceof Error ? error.message : 'Please try refreshing.'}
      />
    );
  }

  const perms = new Set(data.viewer.permissions);
  const isOwner = data.viewer.roleCode === 'FARM_OWNER';

  return (
    <div className="space-y-5">
      {/* Today's Milk & Farm Hero */}
      <Card className="bg-gradient-to-br from-[#1b6b3a] to-[#14532d] text-white border-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">
              {data.farm.name}
            </p>
            <p className="mt-1 text-3xl font-extrabold">
              {formatLitres(data.milkToday.totalLitres)}
              <span className="ml-2 text-sm font-semibold text-emerald-100">today&apos;s milk</span>
            </p>
            <p className="mt-1 text-sm text-emerald-100">
              Morning: {formatLitres(data.milkToday.morningLitres)} • Evening:{' '}
              {formatLitres(data.milkToday.eveningLitres)} • For sale:{' '}
              {formatLitres(data.milkToday.availableForSaleLitres)}
            </p>
          </div>

          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white">
            {isOwner ? t.roles.FARM_OWNER : t.roles.FARM_ASSISTANT}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-emerald-100">
          {data.farm.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {data.farm.location}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {data.clock.nairobiLabel}
          </span>
        </div>

        {/* Thumb-Friendly Daily Primary Actions */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {perms.has('milk.create') && (
            <Link
              to="/milk"
              className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-white text-[#14532d] font-extrabold text-sm hover:bg-emerald-50"
            >
              <Droplets className="h-4 w-4" />
              Record Milk
            </Link>
          )}
          {perms.has('deliveries.create') && (
            <Link
              to="/customers?tab=deliveries"
              className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-white/15 text-white border border-white/25 font-bold text-sm hover:bg-white/20"
            >
              <Truck className="h-4 w-4" />
              Log Delivery
            </Link>
          )}
        </div>
      </Card>

      {/* Important Operational Alerts */}
      {data.productionAlerts.map((alert) => (
        <AlertBanner
          key={alert.animalId}
          tone="warning"
          title={`Milk Drop Alert: ${alert.animalName}`}
          message={alert.message}
        />
      ))}

      {data.deliveriesToday.isSupplyShortage && (
        <AlertBanner
          tone="warning"
          title="Milk Supply Shortage Today"
          message={`Customer daily commitments (${formatLitres(data.deliveriesToday.expectedDemandLitres)}) exceed milk available for sale (${formatLitres(data.milkToday.availableForSaleLitres)}) by ${formatLitres(data.deliveriesToday.supplyShortageLitres)}.`}
        />
      )}

      {/* Single-Cow Hero OR Herd Overview */}
      {data.herd.primaryCow ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <InitialsAvatar name={data.herd.primaryCow.name} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {data.herd.primaryCow.name}
                  </h2>
                  <Badge tone="green">{data.herd.primaryCow.status}</Badge>
                </div>
                <p className="text-xs text-slate-600">
                  Tag {data.herd.primaryCow.tagNumber} • {data.herd.primaryCow.breed}
                </p>
              </div>
            </div>
            <Link
              to="/cows"
              className="rounded-xl bg-[#e6f2ea] px-4 py-2 text-xs font-bold text-[#14532d]"
            >
              View Profile
            </Link>
          </div>
        </Card>
      ) : data.herd.totalActiveCows === 0 ? (
        <Card className="border-dashed border-2 border-[#1b6b3a]/30 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Add your first dairy cow</h2>
              <p className="text-sm text-slate-600">
                Create a cow profile to start logging morning and evening milk.
              </p>
            </div>
            {perms.has('animals.create') && (
              <Link
                to="/cows"
                className="inline-flex items-center gap-2 rounded-xl bg-[#1b6b3a] px-4 py-2.5 text-sm font-bold text-white"
              >
                <Plus className="h-4 w-4" />
                Add Cow
              </Link>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Herd Overview</p>
              <p className="text-xl font-extrabold text-slate-900">
                {data.herd.totalActiveCows} Active Cows ({data.herd.milkingCowsCount} Milking)
              </p>
            </div>
            <Link
              to="/cows"
              className="rounded-xl bg-[#e6f2ea] px-4 py-2 text-xs font-bold text-[#14532d]"
            >
              View Herd
            </Link>
          </div>
        </Card>
      )}

      {/* Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-50 p-3 text-sky-700">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Deliveries Today</p>
              <p className="text-xl font-extrabold text-slate-900">
                {data.deliveriesToday.completedCount} done
                {data.deliveriesToday.pendingCount > 0
                  ? ` • ${data.deliveriesToday.pendingCount} pending`
                  : ''}
              </p>
              <p className="text-xs text-slate-500">
                {formatLitres(data.deliveriesToday.deliveredLitres)} delivered of{' '}
                {formatLitres(data.deliveriesToday.expectedDemandLitres)} expected
              </p>
            </div>
          </div>
        </Card>

        {data.outstandingBalances !== null && (
          <Card>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                <Banknote className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Outstanding Balances</p>
                <p className="text-xl font-extrabold text-slate-900">
                  {formatKes(data.outstandingBalances.totalOutstandingKes)}
                </p>
                <p className="text-xs text-slate-500">
                  {data.outstandingBalances.customersWithBalanceCount} customer(s) with balance
                </p>
              </div>
            </div>
          </Card>
        )}

        {isOwner && (
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#e6f2ea] p-3 text-[#1b6b3a]">
                  <UserPlus className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">{t.dashboard.activeTeam}</p>
                  <p className="text-xl font-extrabold text-slate-900">
                    {data.team.activeMembersCount} active
                  </p>
                  {data.team.pendingInvitationsCount !== null && (
                    <p className="text-xs text-slate-500">
                      {data.team.pendingInvitationsCount} pending invite(s)
                    </p>
                  )}
                </div>
              </div>
              <Link to="/settings?tab=team" className="text-xs font-bold text-[#1b6b3a]">
                Manage
              </Link>
            </div>
          </Card>
        )}
      </div>

      {/* Owner-only Recent Activity */}
      {data.recentActivity !== null && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Activity className="h-5 w-5 text-[#1b6b3a]" />
              {t.dashboard.recentActivity}
            </h2>
            <Link to="/settings?tab=audit" className="text-xs font-bold text-[#1b6b3a]">
              View all
            </Link>
          </div>

          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">{t.dashboard.noActivity}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentActivity.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatActionLabel(item.action)}
                    </p>
                    <p className="text-xs text-slate-500">
                      By {item.actorName}
                      {item.actorPhone ? ` (${item.actorPhone})` : ''}
                    </p>
                  </div>
                  <Badge tone="slate">{formatNairobiDateTime(item.createdAt)}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
