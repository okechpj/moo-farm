import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Archive, Droplets, Edit3, Plus, X } from 'lucide-react';
import { AlertBanner, Badge, Button, Card, InitialsAvatar, Input } from '../components/ui';
import { ApiClientError, apiRequest } from '../lib/apiClient';
import { formatKes, formatLitres, formatNairobiDate } from '../lib/formatters';
import { useAuthStore } from '../stores/authStore';
import { AnimalItem, AnimalOrigin, AnimalStatus } from '../types/api';

const STATUS_OPTIONS: { value: AnimalStatus; label: string; tone: 'green' | 'amber' | 'blue' | 'slate' | 'red' }[] = [
  { value: 'MILKING', label: 'Milking', tone: 'green' },
  { value: 'PREGNANT', label: 'Pregnant', tone: 'blue' },
  { value: 'DRY', label: 'Dry', tone: 'amber' },
  { value: 'SOLD', label: 'Sold', tone: 'slate' },
  { value: 'DECEASED', label: 'Deceased', tone: 'red' },
  { value: 'OTHER', label: 'Other', tone: 'slate' },
];

function getStatusMeta(status: AnimalStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[5];
}

export function CowsPage() {
  const queryClient = useQueryClient();
  const activeMembership = useAuthStore((s) => s.getActiveMembership());
  const farmId = activeMembership?.farmId ?? '';
  const perms = new Set(activeMembership?.permissions ?? []);

  const canCreate = perms.has('animals.create');
  const canUpdate = perms.has('animals.update');
  const canArchive = perms.has('animals.archive');
  const canRecordMilk = perms.has('milk.create');

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAnimal, setEditingAnimal] = useState<AnimalItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [tagNumber, setTagNumber] = useState('');
  const [breed, setBreed] = useState('Friesian');
  const [status, setStatus] = useState<AnimalStatus>('MILKING');
  const [origin, setOrigin] = useState<AnimalOrigin>('PURCHASED');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [acquiredDate, setAcquiredDate] = useState('');
  const [purchasePriceKes, setPurchasePriceKes] = useState('');
  const [notes, setNotes] = useState('');

  const animalsQuery = useQuery({
    queryKey: ['animals', farmId],
    queryFn: () => apiRequest<{ animals: AnimalItem[] }>(`/farms/${farmId}/animals`),
    enabled: Boolean(farmId),
  });

  function openAddModal() {
    setEditingAnimal(null);
    setName('');
    setTagNumber('');
    setBreed('Friesian');
    setStatus('MILKING');
    setOrigin('PURCHASED');
    setDateOfBirth('');
    setAcquiredDate('');
    setPurchasePriceKes('');
    setNotes('');
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(animal: AnimalItem) {
    setEditingAnimal(animal);
    setName(animal.name);
    setTagNumber(animal.tagNumber);
    setBreed(animal.breed);
    setStatus(animal.status);
    setOrigin(animal.origin);
    setDateOfBirth(animal.dateOfBirth ?? '');
    setAcquiredDate(animal.acquiredDate ?? '');
    setPurchasePriceKes(animal.purchasePriceKes !== null ? String(animal.purchasePriceKes) : '');
    setNotes(animal.notes ?? '');
    setFormError(null);
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        tagNumber,
        breed,
        status,
        origin,
        dateOfBirth: dateOfBirth || null,
        acquiredDate: acquiredDate || null,
        purchasePriceKes:
          origin === 'PURCHASED' && purchasePriceKes !== '' ? Number(purchasePriceKes) : null,
        notes: notes.trim() || null,
      };
      if (editingAnimal) {
        return apiRequest(`/farms/${farmId}/animals/${editingAnimal.id}`, {
          method: 'PATCH',
          body: payload,
        });
      }
      return apiRequest(`/farms/${farmId}/animals`, {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: () => {
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['animals', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
    onError: (err) => {
      setFormError(err instanceof ApiClientError ? err.message : 'Could not save cow profile.');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (animalId: string) =>
      apiRequest(`/farms/${farmId}/animals/${animalId}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animals', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
  });

  const animals = animalsQuery.data?.animals ?? [];
  const filteredAnimals =
    statusFilter === 'ALL' ? animals : animals.filter((a) => a.status === statusFilter);
  const isSingleCow = animals.length === 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {isSingleCow ? 'My Cow' : 'My Cows'}
          </h1>
          <p className="text-sm text-slate-600">
            {animals.length === 0
              ? 'Add your dairy cow to start recording daily milk.'
              : isSingleCow
                ? '1 active cow on this farm — ready to grow your herd anytime.'
                : `${animals.length} active cows on this farm.`}
          </p>
        </div>

        {canCreate && (
          <Button type="button" onClick={openAddModal}>
            <Plus className="h-5 w-5" />
            Add Cow
          </Button>
        )}
      </div>

      {/* Filter pills only needed once there are multiple cows */}
      {animals.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
              statusFilter === 'ALL'
                ? 'bg-[#1b6b3a] text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            All ({animals.length})
          </button>
          {STATUS_OPTIONS.slice(0, 4).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
                statusFilter === opt.value
                  ? 'bg-[#1b6b3a] text-white'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {animalsQuery.isLoading ? (
        <div className="h-44 animate-pulse rounded-2xl bg-white border border-slate-200" />
      ) : animalsQuery.error ? (
        <AlertBanner
          tone="error"
          message={
            animalsQuery.error instanceof Error
              ? animalsQuery.error.message
              : 'Failed to load cow profiles.'
          }
        />
      ) : filteredAnimals.length === 0 ? (
        <Card className="text-center py-10 space-y-3">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#e6f2ea] text-[#1b6b3a] text-xl font-extrabold">
            MC
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {animals.length === 0 ? 'No cow added yet' : 'No cows match this filter'}
          </h2>
          <p className="text-sm text-slate-600 max-w-sm mx-auto">
            {animals.length === 0
              ? 'Add your first cow with her name, tag number, and breed to start tracking morning and evening milk.'
              : 'Try choosing another status filter above.'}
          </p>
          {animals.length === 0 && canCreate && (
            <div className="pt-2">
              <Button type="button" onClick={openAddModal}>
                <Plus className="h-5 w-5" />
                Add Your First Cow
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className={isSingleCow ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
          {filteredAnimals.map((animal) => {
            const statusMeta = getStatusMeta(animal.status);
            return (
              <Card key={animal.id} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <InitialsAvatar name={animal.name} size="lg" tone="green" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-extrabold text-slate-900 truncate">
                          {animal.name}
                        </h2>
                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      </div>
                      <p className="text-sm font-semibold text-slate-600">
                        Tag: <span className="font-mono text-slate-900">{animal.tagNumber}</span> •{' '}
                        {animal.breed}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl bg-[#f6f9f4] p-3.5">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Today&apos;s Milk</p>
                    <p className="text-lg font-extrabold text-[#1b6b3a]">
                      {formatLitres(animal.todayLitres ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Origin</p>
                    <p className="text-sm font-bold text-slate-900">
                      {animal.origin === 'BORN_ON_FARM' ? 'Born on farm' : 'Purchased'}
                    </p>
                  </div>
                  {animal.dateOfBirth && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Date of Birth</p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatNairobiDate(animal.dateOfBirth)}
                      </p>
                    </div>
                  )}
                  {animal.acquiredDate && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Date Acquired</p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatNairobiDate(animal.acquiredDate)}
                      </p>
                    </div>
                  )}
                  {animal.purchasePriceKes !== null && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Purchase Price</p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatKes(animal.purchasePriceKes)}
                      </p>
                    </div>
                  )}
                </div>

                {animal.notes && (
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-3.5 py-2.5">
                    {animal.notes}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {canRecordMilk && animal.status === 'MILKING' && (
                    <Link
                      to={`/milk?animalId=${animal.id}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#1b6b3a] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#15562e]"
                    >
                      <Droplets className="h-4 w-4" />
                      Record Milk
                    </Link>
                  )}

                  {canUpdate && (
                    <Button
                      type="button"
                      size="md"
                      variant="outline"
                      onClick={() => openEditModal(animal)}
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </Button>
                  )}

                  {canArchive && (
                    <Button
                      type="button"
                      size="md"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Archive ${animal.name} (${animal.tagNumber})?`)) {
                          archiveMutation.mutate(animal.id);
                        }
                      }}
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Cow Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white p-5 max-h-[92vh] overflow-y-auto safe-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-extrabold text-slate-900">
                {editingAnimal ? `Edit ${editingAnimal.name}` : 'Add New Cow'}
              </h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setModalOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4">
                <AlertBanner tone="error" message={formError} />
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFormError(null);
                saveMutation.mutate();
              }}
              className="mt-4 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Cow Name"
                  placeholder="e.g. Daisy"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Input
                  label="Tag / ID Number"
                  placeholder="e.g. KE-001"
                  value={tagNumber}
                  onChange={(e) => setTagNumber(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Breed"
                  placeholder="e.g. Friesian, Ayrshire, Jersey"
                  value={breed}
                  onChange={(e) => setBreed(e.target.value)}
                  required
                />

                <div className="space-y-1.5">
                  <label htmlFor="cow-status" className="block text-sm font-semibold text-slate-800">
                    Current Status
                  </label>
                  <select
                    id="cow-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AnimalStatus)}
                    className="w-full min-h-[48px] rounded-xl border-2 border-slate-200 bg-white px-3.5 text-base font-medium text-slate-900 focus:border-[#1b6b3a] focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-semibold text-slate-800">Origin</span>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['PURCHASED', 'BORN_ON_FARM'] as AnimalOrigin[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setOrigin(opt)}
                      className={`min-h-[46px] rounded-xl border-2 text-sm font-bold ${
                        origin === opt
                          ? 'border-[#1b6b3a] bg-[#e6f2ea] text-[#14532d]'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {opt === 'PURCHASED' ? 'Purchased' : 'Born on Farm'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Date of Birth (Optional)"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
                <Input
                  label="Date Acquired (Optional)"
                  type="date"
                  value={acquiredDate}
                  onChange={(e) => setAcquiredDate(e.target.value)}
                />
              </div>

              {origin === 'PURCHASED' && (
                <Input
                  label="Purchase Price in KES (Optional)"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 120000"
                  value={purchasePriceKes}
                  onChange={(e) => setPurchasePriceKes(e.target.value)}
                />
              )}

              <Input
                label="Notes (Optional)"
                placeholder="Any helpful details about this cow"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={saveMutation.isPending} className="flex-1">
                  {editingAnimal ? 'Save Changes' : 'Add Cow'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
