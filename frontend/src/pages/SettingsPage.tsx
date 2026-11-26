import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Copy, Plus, Shield, Trash2, UserPlus } from 'lucide-react';
import { AlertBanner, Badge, Button, Card, InitialsAvatar, Input } from '../components/ui';
import { useT } from '../i18n/translations';
import { ApiClientError, apiRequest } from '../lib/apiClient';
import { formatActionLabel, formatNairobiDateTime } from '../lib/formatters';
import { useAuthStore } from '../stores/authStore';
import {
  AuditLogItem,
  CreatedInvitationResponse,
  FarmInvitationItem,
  FarmMemberItem,
  FarmMembership,
} from '../types/api';

type TabKey = 'farm' | 'team' | 'audit' | 'account';

export function SettingsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const user = useAuthStore((s) => s.user);
  const locale = useAuthStore((s) => s.locale);
  const setLocale = useAuthStore((s) => s.setLocale);
  const configurablePermissions = useAuthStore((s) => s.configurablePermissions);
  const updateMemberships = useAuthStore((s) => s.updateMemberships);
  const activeMembership = useAuthStore((s) => s.getActiveMembership());

  const farmId = activeMembership?.farmId ?? '';
  const perms = new Set(activeMembership?.permissions ?? []);
  const canManageFarm = perms.has('farm.manage');
  const canManageUsers = perms.has('users.manage');
  const canViewAudit = perms.has('audit.view');

  const defaultTab: TabKey = canManageFarm ? 'farm' : 'account';
  const requestedTab = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey =
    requestedTab &&
    ((requestedTab === 'farm' && canManageFarm) ||
      (requestedTab === 'team' && canManageUsers) ||
      (requestedTab === 'audit' && canViewAudit) ||
      requestedTab === 'account')
      ? requestedTab
      : defaultTab;

  function selectTab(tab: TabKey) {
    setSearchParams({ tab });
  }

  // Farm Settings Form State
  const [farmName, setFarmName] = useState(activeMembership?.farm.name ?? '');
  const [farmLocation, setFarmLocation] = useState(activeMembership?.farm.location ?? '');
  const [dropThreshold, setDropThreshold] = useState(
    String(activeMembership?.farm.milkDropAlertThresholdPct ?? 20),
  );
  const [baselineDays, setBaselineDays] = useState(
    String(activeMembership?.farm.milkDropBaselineDays ?? 7),
  );
  const [farmFeedback, setFarmFeedback] = useState<{ tone: 'success' | 'error'; msg: string } | null>(
    null,
  );

  const updateFarmMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/farms/${farmId}`, {
        method: 'PATCH',
        body: {
          name: farmName,
          location: farmLocation.trim() || null,
          milkDropAlertThresholdPct: Number(dropThreshold),
          milkDropBaselineDays: Number(baselineDays),
        },
      }),
    onSuccess: async () => {
      const list = await apiRequest<{ farms: FarmMembership[] }>('/farms');
      updateMemberships(list.farms);
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
      setFarmFeedback({ tone: 'success', msg: 'Farm settings saved.' });
    },
    onError: (err) => {
      setFarmFeedback({
        tone: 'error',
        msg: err instanceof ApiClientError ? err.message : 'Failed to update farm settings.',
      });
    },
  });

  // Team & Invitations Queries
  const membersQuery = useQuery({
    queryKey: ['farm-members', farmId],
    queryFn: () => apiRequest<{ members: FarmMemberItem[] }>(`/farms/${farmId}/members`),
    enabled: Boolean(farmId) && canManageUsers && activeTab === 'team',
  });

  const invitationsQuery = useQuery({
    queryKey: ['farm-invitations', farmId],
    queryFn: () =>
      apiRequest<{ invitations: FarmInvitationItem[] }>(`/farms/${farmId}/members/invitations`),
    enabled: Boolean(farmId) && canManageUsers && activeTab === 'team',
  });

  const auditQuery = useQuery({
    queryKey: ['farm-audit', farmId],
    queryFn: () => apiRequest<{ auditLogs: AuditLogItem[] }>(`/farms/${farmId}/audit-logs?limit=40`),
    enabled: Boolean(farmId) && canViewAudit && activeTab === 'audit',
  });

  // Invite Assistant Form State
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePerms, setInvitePerms] = useState<string[]>([]);
  const [createdInvite, setCreatedInvite] = useState<CreatedInvitationResponse | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const createInviteMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ invitation: CreatedInvitationResponse }>(`/farms/${farmId}/members/invitations`, {
        method: 'POST',
        body: {
          phone: invitePhone,
          inviteeName: inviteName.trim() || undefined,
          grantedPermissions: invitePerms,
        },
      }),
    onSuccess: (res) => {
      setCreatedInvite(res.invitation);
      setInvitePhone('');
      setInviteName('');
      setInvitePerms([]);
      setInviteError(null);
      queryClient.invalidateQueries({ queryKey: ['farm-invitations', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
    onError: (err) => {
      setInviteError(err instanceof ApiClientError ? err.message : 'Failed to create invitation.');
    },
  });

  const togglePermMutation = useMutation({
    mutationFn: ({
      membershipId,
      key,
      value,
    }: {
      membershipId: string;
      key: string;
      value: boolean;
    }) =>
      apiRequest(`/farms/${farmId}/members/${membershipId}/permissions`, {
        method: 'PATCH',
        body: { permissions: { [key]: value } },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['farm-members', farmId] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      membershipId,
      status,
    }: {
      membershipId: string;
      status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
    }) =>
      apiRequest(`/farms/${farmId}/members/${membershipId}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['farm-members', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (invitationId: string) =>
      apiRequest(`/farms/${farmId}/members/invitations/${invitationId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['farm-invitations', farmId] });
    },
  });

  async function handleCopyInviteCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  }

  const tabs: { key: TabKey; label: string; visible: boolean }[] = [
    { key: 'farm', label: t.settings.farmTab, visible: canManageFarm },
    { key: 'team', label: t.settings.teamTab, visible: canManageUsers },
    { key: 'audit', label: t.settings.auditTab, visible: canViewAudit },
    { key: 'account', label: t.settings.accountTab, visible: true },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{t.settings.title}</h1>
        <p className="text-sm text-slate-600">
          {activeMembership?.farm.name} • {activeMembership?.role.name}
        </p>
      </div>

      {/* Horizontal Scrollable Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs
          .filter((tab) => tab.visible)
          .map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#1b6b3a] text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
      </div>

      {/* TAB 1: FARM PROFILE */}
      {activeTab === 'farm' && canManageFarm && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-bold text-slate-900">Farm Details & Alert Thresholds</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Timezone: Africa/Nairobi • Currency: KES
            </p>

            {farmFeedback && (
              <div className="mt-4">
                <AlertBanner tone={farmFeedback.tone} message={farmFeedback.msg} />
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFarmFeedback(null);
                updateFarmMutation.mutate();
              }}
              className="mt-4 space-y-4"
            >
              <Input
                label="Farm Name"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                required
              />

              <Input
                label="Location"
                value={farmLocation}
                onChange={(e) => setFarmLocation(e.target.value)}
                placeholder="e.g. Kiambu County"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Milk Drop Alert Threshold (%)"
                  type="number"
                  min={5}
                  max={80}
                  value={dropThreshold}
                  onChange={(e) => setDropThreshold(e.target.value)}
                  hint="Alert when daily milk drops by this % below baseline."
                />
                <Input
                  label="Baseline History (Days)"
                  type="number"
                  min={3}
                  max={30}
                  value={baselineDays}
                  onChange={(e) => setBaselineDays(e.target.value)}
                  hint="Rolling days used to calculate normal cow output."
                />
              </div>

              <Button type="submit" loading={updateFarmMutation.isPending}>
                Save Farm Settings
              </Button>
            </form>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">Multi-Farm Management</h3>
                <p className="text-sm text-slate-600">
                  Manage additional dairy farms from the same account.
                </p>
              </div>
              <Link
                to="/create-farm"
                className="inline-flex items-center gap-2 rounded-xl bg-[#e6f2ea] px-4 py-2.5 text-sm font-bold text-[#14532d]"
              >
                <Plus className="h-4 w-4" />
                Add Another Farm
              </Link>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: TEAM & ASSISTANTS */}
      {activeTab === 'team' && canManageUsers && (
        <div className="space-y-5">
          {/* Invite Assistant Card */}
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="h-5 w-5 text-[#1b6b3a]" />
              <h2 className="text-lg font-bold text-slate-900">Invite a Farm Assistant</h2>
            </div>
            <p className="text-sm text-slate-600">
              Assistants sign in with their <strong>phone number</strong> and a one-time invite code (no email required).
            </p>

            {inviteError && (
              <div className="mt-4">
                <AlertBanner tone="error" message={inviteError} />
              </div>
            )}

            {createdInvite && (
              <div className="mt-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 space-y-2">
                <p className="text-sm font-bold text-emerald-900">
                  Invitation ready for {createdInvite.inviteeName || createdInvite.phone}!
                </p>
                <p className="text-xs text-emerald-800">
                  Share this invite code with your assistant. They will enter their phone number ({createdInvite.phone}) and this code on the Join Farm screen:
                </p>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 border border-emerald-200">
                  <span className="font-mono text-2xl font-extrabold tracking-widest text-[#1b6b3a]">
                    {createdInvite.inviteCode}
                  </span>
                  <Button
                    type="button"
                    size="md"
                    variant="secondary"
                    onClick={() => handleCopyInviteCode(createdInvite.inviteCode)}
                  >
                    {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedCode ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-emerald-700">
                  Expires {formatNairobiDateTime(createdInvite.expiresAt)}.
                </p>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setInviteError(null);
                createInviteMutation.mutate();
              }}
              className="mt-4 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Assistant Phone Number (Kenya)"
                  type="tel"
                  placeholder="0712 345 678"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  required
                />
                <Input
                  label="Assistant Name (Optional)"
                  placeholder="e.g. Peter Kamau"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
              </div>

              {configurablePermissions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">
                    Optional Extra Permissions (Owner-Controlled)
                  </p>
                  <div className="space-y-2">
                    {configurablePermissions.map((perm) => {
                      const checked = invitePerms.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setInvitePerms((prev) =>
                                checked ? prev.filter((k) => k !== perm.key) : [...prev, perm.key],
                              )
                            }
                            className="mt-1 h-4 w-4 accent-[#1b6b3a]"
                          />
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{perm.key}</p>
                            <p className="text-xs text-slate-600">{perm.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <Button type="submit" loading={createInviteMutation.isPending}>
                Generate Invite Code
              </Button>
            </form>
          </Card>

          {/* Active Members List */}
          <Card>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Farm Team</h2>
            {membersQuery.isLoading ? (
              <p className="text-sm text-slate-500">Loading team members...</p>
            ) : (
              <div className="space-y-4">
                {membersQuery.data?.members.map((member) => {
                  const isAssistant = member.role.code === 'FARM_ASSISTANT';
                  return (
                    <div
                      key={member.membershipId}
                      className="rounded-xl border border-slate-200 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <InitialsAvatar
                            name={member.user.fullName}
                            tone={isAssistant ? 'amber' : 'green'}
                          />
                          <div>
                            <p className="font-bold text-slate-900">{member.user.fullName}</p>
                            <p className="text-xs text-slate-600">{member.user.phone}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge tone={isAssistant ? 'amber' : 'green'}>{member.role.name}</Badge>
                          <Badge tone={member.status === 'ACTIVE' ? 'green' : 'red'}>
                            {member.status}
                          </Badge>
                        </div>
                      </div>

                      {isAssistant && (
                        <div className="pt-3 border-t border-slate-100 space-y-3">
                          <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              Configurable Permissions
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {configurablePermissions.map((perm) => {
                                const enabled = Boolean(member.configurablePermissions[perm.key]);
                                return (
                                  <button
                                    key={perm.key}
                                    type="button"
                                    disabled={togglePermMutation.isPending}
                                    onClick={() =>
                                      togglePermMutation.mutate({
                                        membershipId: member.membershipId,
                                        key: perm.key,
                                        value: !enabled,
                                      })
                                    }
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                      enabled
                                        ? 'border-[#1b6b3a] bg-[#e6f2ea] text-[#14532d]'
                                        : 'border-slate-200 bg-white text-slate-600'
                                    }`}
                                  >
                                    {enabled ? 'Allowed: ' : 'Off: '}
                                    {perm.key}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {member.status === 'ACTIVE' ? (
                              <Button
                                type="button"
                                size="md"
                                variant="outline"
                                loading={updateStatusMutation.isPending}
                                onClick={() =>
                                  updateStatusMutation.mutate({
                                    membershipId: member.membershipId,
                                    status: 'SUSPENDED',
                                  })
                                }
                              >
                                Suspend Access
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="md"
                                variant="secondary"
                                loading={updateStatusMutation.isPending}
                                onClick={() =>
                                  updateStatusMutation.mutate({
                                    membershipId: member.membershipId,
                                    status: 'ACTIVE',
                                  })
                                }
                              >
                                Reactivate Access
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Pending Invitations */}
          <Card>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Invitations</h2>
            {invitationsQuery.isLoading ? (
              <p className="text-sm text-slate-500">Loading invitations...</p>
            ) : invitationsQuery.data?.invitations.length === 0 ? (
              <p className="text-sm text-slate-500">No invitations sent yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {invitationsQuery.data?.invitations.map((inv) => (
                  <div key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {inv.inviteeName || inv.phone}{' '}
                        <span className="text-xs font-normal text-slate-500">({inv.phone})</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Expires {formatNairobiDateTime(inv.expiresAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          inv.status === 'ACCEPTED'
                            ? 'green'
                            : inv.status === 'PENDING'
                              ? 'amber'
                              : 'slate'
                        }
                      >
                        {inv.status}
                      </Badge>
                      {inv.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => revokeInviteMutation.mutate(inv.id)}
                          className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                          title="Revoke invitation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: AUDIT LOG */}
      {activeTab === 'audit' && canViewAudit && (
        <Card>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Farm Activity & Audit History</h2>
          {auditQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading activity logs...</p>
          ) : auditQuery.data?.auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditQuery.data?.auditLogs.map((log) => (
                <div key={log.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {formatActionLabel(log.action)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {log.actor ? `${log.actor.fullName} (${log.actor.phone})` : 'System'} •{' '}
                      {log.entityType}
                    </p>
                  </div>
                  <Badge tone="slate">{formatNairobiDateTime(log.createdAt)}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* TAB 4: MY ACCOUNT */}
      {activeTab === 'account' && user && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-4">
              <InitialsAvatar name={user.fullName} size="lg" />
              <div>
                <h2 className="text-lg font-bold text-slate-900">{user.fullName}</h2>
                <p className="text-sm text-slate-600">{user.phone}</p>
                {user.email && <p className="text-xs text-slate-500">{user.email}</p>}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">Language / Lugha</p>
                <p className="text-xs text-slate-500">
                  Switch interface language (English & Kiswahili ready)
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="md"
                  variant={locale === 'en' ? 'primary' : 'outline'}
                  onClick={() => setLocale('en')}
                >
                  English
                </Button>
                <Button
                  type="button"
                  size="md"
                  variant={locale === 'sw' ? 'primary' : 'outline'}
                  onClick={() => setLocale('sw')}
                >
                  Kiswahili
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Shield className="h-5 w-5 text-[#1b6b3a]" />
              My Permissions on {activeMembership?.farm.name}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeMembership?.permissions.map((perm) => (
                <Badge key={perm} tone="slate">
                  {perm}
                </Badge>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
