import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Edit3, Moon, Sun, X } from 'lucide-react';
import { AlertBanner, Badge, Button, Card, InitialsAvatar, Input } from '../components/ui';
import { ApiClientError, apiRequest } from '../lib/apiClient';
import {
  formatLitres,
  formatNairobiDate,
  getDefaultMilkingSession,
  getNairobiTodayDate,
} from '../lib/formatters';
import { useAuthStore } from '../stores/authStore';
import {
  AnimalItem,
  MilkingSession,
  MilkRecordItem,
  MilkSummaryData,
  SupplyBalanceData,
} from '../types/api';

export function MilkPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const activeMembership = useAuthStore((s) => s.getActiveMembership());
  const farmId = activeMembership?.farmId ?? '';
  const perms = new Set(activeMembership?.permissions ?? []);

  const canCreate = perms.has('milk.create');
  const canCorrect = perms.has('milk.update');

  const animalsQuery = useQuery({
    queryKey: ['animals', farmId],
    queryFn: () => apiRequest<{ animals: AnimalItem[] }>(`/farms/${farmId}/animals`),
    enabled: Boolean(farmId),
  });

  const summaryQuery = useQuery({
    queryKey: ['milk-summary', farmId],
    queryFn: () => apiRequest<MilkSummaryData>(`/farms/${farmId}/milk/summary?days=14`),
    enabled: Boolean(farmId),
  });

  const supplyQuery = useQuery({
    queryKey: ['milk-supply-balance', farmId],
    queryFn: () => apiRequest<SupplyBalanceData>(`/farms/${farmId}/milk/supply-balance`),
    enabled: Boolean(farmId),
  });

  const recordsQuery = useQuery({
    queryKey: ['milk-records', farmId],
    queryFn: () => apiRequest<{ records: MilkRecordItem[] }>(`/farms/${farmId}/milk?limit=40`),
    enabled: Boolean(farmId),
  });

  const animals = animalsQuery.data?.animals ?? [];
  const activeMilkingAnimals = animals.filter((a) => a.status !== 'SOLD' && a.status !== 'DECEASED');

  // Record Milk Form State
  const [animalId, setAnimalId] = useState(searchParams.get('animalId') ?? '');
  const [recordDate, setRecordDate] = useState(getNairobiTodayDate());
  const [session, setSession] = useState<MilkingSession>(getDefaultMilkingSession());
  const [quantityLitres, setQuantityLitres] = useState('');
  const [homeUseLitres, setHomeUseLitres] = useState('');
  const [soldLitres, setSoldLitres] = useState('');
  const [spoiledLitres, setSpoiledLitres] = useState('');
  const [notes, setNotes] = useState('');
  const [showSplit, setShowSplit] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null);

  // Auto-select sole active cow for 1-cow farm fast path
  useEffect(() => {
    if (!animalId && activeMilkingAnimals.length > 0) {
      setAnimalId(activeMilkingAnimals[0].id);
    }
  }, [animalId, activeMilkingAnimals]);

  // Correction modal state
  const [correcting, setCorrecting] = useState<MilkRecordItem | null>(null);
  const [corrQty, setCorrQty] = useState('');
  const [corrHome, setCorrHome] = useState('');
  const [corrSold, setCorrSold] = useState('');
  const [corrSpoiled, setCorrSpoiled] = useState('');
  const [corrReason, setCorrReason] = useState('');
  const [corrError, setCorrError] = useState<string | null>(null);

  const recordMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/farms/${farmId}/milk`, {
        method: 'POST',
        body: {
          animalId,
          recordDate,
          session,
          quantityLitres: Number(quantityLitres),
          homeUseLitres: homeUseLitres ? Number(homeUseLitres) : 0,
          soldLitres: soldLitres ? Number(soldLitres) : 0,
          spoiledLitres: spoiledLitres ? Number(spoiledLitres) : 0,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setQuantityLitres('');
      setHomeUseLitres('');
      setSoldLitres('');
      setSpoiledLitres('');
      setNotes('');
      setFeedback({ tone: 'success', msg: 'Milk production saved!' });
      queryClient.invalidateQueries({ queryKey: ['milk-summary', farmId] });
      queryClient.invalidateQueries({ queryKey: ['milk-records', farmId] });
      queryClient.invalidateQueries({ queryKey: ['milk-supply-balance', farmId] });
      queryClient.invalidateQueries({ queryKey: ['animals', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
    onError: (err) => {
      setFeedback({
        tone: 'error',
        msg: err instanceof ApiClientError ? err.message : 'Could not save milk record.',
      });
    },
  });

  const correctMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/farms/${farmId}/milk/${correcting!.id}/correct`, {
        method: 'POST',
        body: {
          quantityLitres: Number(corrQty),
          homeUseLitres: corrHome ? Number(corrHome) : 0,
          soldLitres: corrSold ? Number(corrSold) : 0,
          spoiledLitres: corrSpoiled ? Number(corrSpoiled) : 0,
          correctionReason: corrReason,
        },
      }),
    onSuccess: () => {
      setCorrecting(null);
      setCorrError(null);
      queryClient.invalidateQueries({ queryKey: ['milk-summary', farmId] });
      queryClient.invalidateQueries({ queryKey: ['milk-records', farmId] });
      queryClient.invalidateQueries({ queryKey: ['milk-supply-balance', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
    onError: (err) => {
      setCorrError(err instanceof ApiClientError ? err.message : 'Could not correct entry.');
    },
  });

  function openCorrection(rec: MilkRecordItem) {
    setCorrecting(rec);
    setCorrQty(String(rec.quantityLitres));
    setCorrHome(String(rec.homeUseLitres));
    setCorrSold(String(rec.soldLitres));
    setCorrSpoiled(String(rec.spoiledLitres));
    setCorrReason('');
    setCorrError(null);
  }

  const summary = summaryQuery.data;
  const supply = supplyQuery.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Milk Records</h1>
        <p className="text-sm text-slate-600">
          Record morning and evening milking in litres (Africa/Nairobi date).
        </p>
      </div>

      {/* Production Drop Alerts */}
      {summary && summary.productionAlerts.length > 0 && (
        <div className="space-y-2">
          {summary.productionAlerts.map((alert) => (
            <AlertBanner
              key={alert.animalId}
              tone="warning"
              title={`Milk Production Drop Alert — ${alert.animalName}`}
              message={alert.message}
            />
          ))}
        </div>
      )}

      {/* Fast Record Milk Card */}
      {canCreate && (
        <Card className="border-2 border-[#1b6b3a]/20">
          <h2 className="text-lg font-extrabold text-slate-900">Record Milking Session</h2>

          {activeMilkingAnimals.length === 0 ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-600">
                Add a cow first before recording milk production.
              </p>
              <Link
                to="/cows"
                className="inline-flex items-center justify-center rounded-xl bg-[#1b6b3a] px-4 py-2.5 text-sm font-bold text-white"
              >
                Go to My Cows
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFeedback(null);
                recordMutation.mutate();
              }}
              className="mt-4 space-y-4"
            >
              {feedback && <AlertBanner tone={feedback.tone} message={feedback.msg} />}

              {/* Single-cow auto-selected pill OR Multi-cow selector */}
              {activeMilkingAnimals.length === 1 ? (
                <div className="flex items-center gap-3 rounded-xl bg-[#f6f9f4] px-3.5 py-2.5">
                  <InitialsAvatar name={activeMilkingAnimals[0].name} size="sm" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {activeMilkingAnimals[0].name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Tag {activeMilkingAnimals[0].tagNumber} • Auto-selected
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="milk-cow" className="block text-sm font-semibold text-slate-800">
                    Select Cow
                  </label>
                  <select
                    id="milk-cow"
                    value={animalId}
                    onChange={(e) => setAnimalId(e.target.value)}
                    required
                    className="w-full min-h-[48px] rounded-xl border-2 border-slate-200 bg-white px-3.5 text-base font-semibold text-slate-900 focus:border-[#1b6b3a] focus:outline-none"
                  >
                    {activeMilkingAnimals.map((cow) => (
                      <option key={cow.id} value={cow.id}>
                        {cow.name} ({cow.tagNumber})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Large Morning / Evening Session Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSession('MORNING')}
                  className={`flex items-center justify-center gap-2 min-h-[54px] rounded-xl border-2 text-base font-bold transition-colors ${
                    session === 'MORNING'
                      ? 'border-[#1b6b3a] bg-[#e6f2ea] text-[#14532d]'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <Sun className="h-5 w-5" />
                  Morning
                </button>
                <button
                  type="button"
                  onClick={() => setSession('EVENING')}
                  className={`flex items-center justify-center gap-2 min-h-[54px] rounded-xl border-2 text-base font-bold transition-colors ${
                    session === 'EVENING'
                      ? 'border-[#1b6b3a] bg-[#e6f2ea] text-[#14532d]'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <Moon className="h-5 w-5" />
                  Evening
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Milk Produced (Litres)"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  placeholder="e.g. 12.5"
                  value={quantityLitres}
                  onChange={(e) => setQuantityLitres(e.target.value)}
                  required
                />
                <Input
                  label="Date"
                  type="date"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowSplit((v) => !v)}
                  className="text-sm font-bold text-[#1b6b3a]"
                >
                  {showSplit
                    ? 'Hide home use / sold / spoiled breakdown'
                    : '+ Add milk used at home, sold, or spoiled (optional)'}
                </button>

                {showSplit && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3.5">
                    <Input
                      label="Used at Home (L)"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      placeholder="0"
                      value={homeUseLitres}
                      onChange={(e) => setHomeUseLitres(e.target.value)}
                    />
                    <Input
                      label="Sold (L)"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      placeholder="0"
                      value={soldLitres}
                      onChange={(e) => setSoldLitres(e.target.value)}
                    />
                    <Input
                      label="Spoiled / Discarded (L)"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      placeholder="0"
                      value={spoiledLitres}
                      onChange={(e) => setSpoiledLitres(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <Input
                label="Notes (Optional)"
                placeholder="e.g. Milked calmly, good appetite"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <Button type="submit" loading={recordMutation.isPending} className="w-full">
                Save {session === 'MORNING' ? 'Morning' : 'Evening'} Milk
              </Button>
            </form>
          )}
        </Card>
      )}

      {/* Production Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <p className="text-xs font-semibold text-slate-500">Today Total</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1b6b3a]">
              {formatLitres(summary.today.totalLitres)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              AM: {formatLitres(summary.today.morningLitres)} • PM:{' '}
              {formatLitres(summary.today.eveningLitres)}
            </p>
          </Card>

          <Card>
            <p className="text-xs font-semibold text-slate-500">Available for Sale</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">
              {formatLitres(summary.today.availableForSaleLitres)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Home: {formatLitres(summary.today.homeUseLitres)} • Spoiled:{' '}
              {formatLitres(summary.today.spoiledLitres)}
            </p>
          </Card>

          <Card>
            <p className="text-xs font-semibold text-slate-500">Last 7 Days</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">
              {formatLitres(summary.weeklyTotalLitres)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Avg: {formatLitres(summary.monthly.averageDailyLitres)}/day
            </p>
          </Card>

          <Card>
            <p className="text-xs font-semibold text-slate-500">Last 30 Days</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">
              {formatLitres(summary.monthly.totalLitres)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Across {summary.monthly.recordedDays} active days
            </p>
          </Card>
        </div>
      )}

      {/* Supply vs Customer Demand Banner */}
      {supply && supply.totalCustomerDemandLitres > 0 && (
        <Card className={supply.isSupplyShortage ? 'border-amber-300 bg-amber-50/40' : ''}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {supply.isSupplyShortage ? (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              )}
              <h3 className="text-base font-bold text-slate-900">
                Today&apos;s Milk Supply vs Customer Demand
              </h3>
            </div>
            <Badge tone={supply.isSupplyShortage ? 'amber' : 'green'}>
              {supply.isSupplyShortage
                ? `Short by ${formatLitres(supply.supplyShortageLitres)}`
                : 'Supply covers commitments'}
            </Badge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-white p-2.5 border border-slate-200">
              <p className="text-xs text-slate-500">Available</p>
              <p className="text-base font-extrabold text-[#1b6b3a]">
                {formatLitres(supply.availableForSaleLitres)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-2.5 border border-slate-200">
              <p className="text-xs text-slate-500">Customer Demand</p>
              <p className="text-base font-extrabold text-slate-900">
                {formatLitres(supply.totalCustomerDemandLitres)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-2.5 border border-slate-200">
              <p className="text-xs text-slate-500">Delivered</p>
              <p className="text-base font-extrabold text-sky-700">
                {formatLitres(supply.deliveredLitres)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 14-Day Trend Chart */}
      {summary && (
        <Card>
          <h2 className="text-base font-bold text-slate-900 mb-3">
            Daily Milk Production (Last 14 Days)
          </h2>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.dailyTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => `${val} L`} />
                <Legend />
                <Bar dataKey="morningLitres" name="Morning (L)" stackId="a" fill="#1b6b3a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="eveningLitres" name="Evening (L)" stackId="a" fill="#65a30d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Milk History List */}
      <Card>
        <h2 className="text-base font-bold text-slate-900 mb-3">Recent Milking History</h2>
        {recordsQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading milk records...</p>
        ) : recordsQuery.data?.records.length === 0 ? (
          <p className="text-sm text-slate-500">No milk records yet. Record your first milking above.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recordsQuery.data?.records.map((rec) => (
              <div key={rec.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-extrabold text-[#1b6b3a]">
                      {formatLitres(rec.quantityLitres)}
                    </span>
                    <Badge tone={rec.session === 'MORNING' ? 'amber' : 'blue'}>
                      {rec.session === 'MORNING' ? 'Morning' : 'Evening'}
                    </Badge>
                    <span className="text-sm font-semibold text-slate-800">{rec.animalName}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatNairobiDate(rec.recordDate)} • Recorded by {rec.recordedBy.fullName}
                    {rec.homeUseLitres > 0 ? ` • Home: ${formatLitres(rec.homeUseLitres)}` : ''}
                    {rec.spoiledLitres > 0 ? ` • Spoiled: ${formatLitres(rec.spoiledLitres)}` : ''}
                  </p>
                  {rec.correctionReason && (
                    <p className="mt-0.5 text-xs font-medium text-amber-700">
                      Corrected: {rec.correctionReason}
                    </p>
                  )}
                </div>

                {canCorrect && (
                  <Button
                    type="button"
                    size="md"
                    variant="outline"
                    onClick={() => openCorrection(rec)}
                  >
                    <Edit3 className="h-4 w-4" />
                    Correct
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Formal Correction Modal */}
      {correcting && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-5 max-h-[90vh] overflow-y-auto safe-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-extrabold text-slate-900">Correct Milk Record</h2>
              <button
                type="button"
                aria-label="Close correction modal"
                onClick={() => setCorrecting(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Original entry ({formatLitres(correcting.quantityLitres)} for {correcting.animalName} on{' '}
              {formatNairobiDate(correcting.recordDate)}) will be preserved in audit history.
            </p>

            {corrError && (
              <div className="mt-3">
                <AlertBanner tone="error" message={corrError} />
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCorrError(null);
                correctMutation.mutate();
              }}
              className="mt-4 space-y-3"
            >
              <Input
                label="Corrected Quantity (Litres)"
                type="number"
                step="0.1"
                min="0.1"
                value={corrQty}
                onChange={(e) => setCorrQty(e.target.value)}
                required
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  label="Home (L)"
                  type="number"
                  step="0.1"
                  min="0"
                  value={corrHome}
                  onChange={(e) => setCorrHome(e.target.value)}
                />
                <Input
                  label="Sold (L)"
                  type="number"
                  step="0.1"
                  min="0"
                  value={corrSold}
                  onChange={(e) => setCorrSold(e.target.value)}
                />
                <Input
                  label="Spoiled (L)"
                  type="number"
                  step="0.1"
                  min="0"
                  value={corrSpoiled}
                  onChange={(e) => setCorrSpoiled(e.target.value)}
                />
              </div>
              <Input
                label="Reason for Correction"
                placeholder="e.g. Entered 15L instead of 12.5L"
                value={corrReason}
                onChange={(e) => setCorrReason(e.target.value)}
                required
              />
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCorrecting(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={correctMutation.isPending} className="flex-1">
                  Save Correction
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
