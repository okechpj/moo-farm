import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  Check,
  Edit3,
  FileText,
  Plus,
  Truck,
  X,
} from 'lucide-react';
import { AlertBanner, Badge, Button, Card, InitialsAvatar, Input } from '../components/ui';
import { ApiClientError, apiRequest } from '../lib/apiClient';
import {
  formatKes,
  formatLitres,
  formatNairobiDate,
  getNairobiTodayDate,
} from '../lib/formatters';
import { useAuthStore } from '../stores/authStore';
import {
  CustomerItem,
  CustomerStatementData,
  CustomerStatus,
  DailyChecklistResponse,
  PaymentItem,
  PaymentMethod,
} from '../types/api';

type TabKey = 'deliveries' | 'customers' | 'payments';

export function CustomersPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeMembership = useAuthStore((s) => s.getActiveMembership());
  const farmId = activeMembership?.farmId ?? '';
  const perms = new Set(activeMembership?.permissions ?? []);

  const canManageCustomers = perms.has('customers.manage');
  const canCreateDelivery = perms.has('deliveries.create');
  const canViewPayments = perms.has('payments.view');
  const canCreatePayments = perms.has('payments.create');
  const canVoidPayments = perms.has('payments.manage');

  const reqTab = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey =
    reqTab === 'customers' || (reqTab === 'payments' && (canViewPayments || canCreatePayments))
      ? reqTab
      : 'deliveries';

  const [selectedDate, setSelectedDate] = useState(getNairobiTodayDate());
  const [deliveryFeedback, setDeliveryFeedback] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null);

  // Queries
  const checklistQuery = useQuery({
    queryKey: ['deliveries-checklist', farmId, selectedDate],
    queryFn: () =>
      apiRequest<DailyChecklistResponse>(
        `/farms/${farmId}/deliveries/daily-checklist?date=${selectedDate}`,
      ),
    enabled: Boolean(farmId) && activeTab === 'deliveries',
  });

  const customersQuery = useQuery({
    queryKey: ['customers', farmId],
    queryFn: () => apiRequest<{ customers: CustomerItem[] }>(`/farms/${farmId}/customers`),
    enabled: Boolean(farmId),
  });

  const paymentsQuery = useQuery({
    queryKey: ['payments', farmId],
    queryFn: () => apiRequest<{ payments: PaymentItem[] }>(`/farms/${farmId}/payments?limit=50`),
    enabled: Boolean(farmId) && canViewPayments && activeTab === 'payments',
  });

  // Custom delivery quick modal
  const [customDeliveryCust, setCustomDeliveryCust] = useState<{
    id: string;
    name: string;
    defaultLitres: number;
  } | null>(null);
  const [customQty, setCustomQty] = useState('');
  const [customNotes, setCustomNotes] = useState('');

  const createDeliveryMutation = useMutation({
    mutationFn: (payload: {
      customerId: string;
      quantityLitres: number;
      deliveryDate: string;
      notes?: string;
    }) =>
      apiRequest(`/farms/${farmId}/deliveries`, {
        method: 'POST',
        body: { ...payload, deliveryStatus: 'DELIVERED' },
      }),
    onSuccess: () => {
      setCustomDeliveryCust(null);
      setDeliveryFeedback({ tone: 'success', msg: 'Delivery recorded!' });
      queryClient.invalidateQueries({ queryKey: ['deliveries-checklist', farmId] });
      queryClient.invalidateQueries({ queryKey: ['customers', farmId] });
      queryClient.invalidateQueries({ queryKey: ['milk-supply-balance', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
    onError: (err) => {
      setDeliveryFeedback({
        tone: 'error',
        msg: err instanceof ApiClientError ? err.message : 'Could not record delivery.',
      });
    },
  });

  // Add/Edit Customer Modal
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custLocation, setCustLocation] = useState('');
  const [custPrice, setCustPrice] = useState('60');
  const [custExpected, setCustExpected] = useState('2');
  const [custNotes, setCustNotes] = useState('');
  const [custStatus, setCustStatus] = useState<CustomerStatus>('ACTIVE');
  const [custError, setCustError] = useState<string | null>(null);

  function openAddCustomer() {
    setEditingCustomer(null);
    setCustName('');
    setCustPhone('');
    setCustLocation('');
    setCustPrice('60');
    setCustExpected('2');
    setCustNotes('');
    setCustStatus('ACTIVE');
    setCustError(null);
    setCustomerModalOpen(true);
  }

  function openEditCustomer(c: CustomerItem) {
    setEditingCustomer(c);
    setCustName(c.name);
    setCustPhone(c.phone);
    setCustLocation(c.location ?? '');
    setCustPrice(String(c.agreedPricePerLitre));
    setCustExpected(String(c.expectedDailyLitres));
    setCustNotes(c.agreementNotes ?? '');
    setCustStatus(c.status);
    setCustError(null);
    setCustomerModalOpen(true);
  }

  const saveCustomerMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: custName,
        phone: custPhone,
        location: custLocation.trim() || null,
        agreedPricePerLitre: Number(custPrice),
        expectedDailyLitres: Number(custExpected || 0),
        agreementNotes: custNotes.trim() || null,
        status: custStatus,
      };
      if (editingCustomer) {
        return apiRequest(`/farms/${farmId}/customers/${editingCustomer.id}`, {
          method: 'PATCH',
          body,
        });
      }
      return apiRequest(`/farms/${farmId}/customers`, { method: 'POST', body });
    },
    onSuccess: () => {
      setCustomerModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['customers', farmId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries-checklist', farmId] });
      queryClient.invalidateQueries({ queryKey: ['milk-supply-balance', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
    onError: (err) => {
      setCustError(err instanceof ApiClientError ? err.message : 'Could not save customer.');
    },
  });

  // Statement modal
  const [statementCustomerId, setStatementCustomerId] = useState<string | null>(null);
  const statementQuery = useQuery({
    queryKey: ['customer-statement', farmId, statementCustomerId],
    queryFn: () =>
      apiRequest<CustomerStatementData>(
        `/farms/${farmId}/customers/${statementCustomerId}/statement`,
      ),
    enabled: Boolean(farmId) && Boolean(statementCustomerId) && canViewPayments,
  });

  // Record Payment form
  const [payCustomerId, setPayCustomerId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('MPESA');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(getNairobiTodayDate());
  const [payNotes, setPayNotes] = useState('');
  const [payFeedback, setPayFeedback] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null);

  const recordPaymentMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/farms/${farmId}/payments`, {
        method: 'POST',
        body: {
          customerId: payCustomerId,
          amountKes: Number(payAmount),
          method: payMethod,
          referenceCode: payRef.trim() || undefined,
          paymentDate: payDate,
          notes: payNotes.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setPayAmount('');
      setPayRef('');
      setPayNotes('');
      setPayFeedback({ tone: 'success', msg: 'Payment recorded and allocated to deliveries!' });
      queryClient.invalidateQueries({ queryKey: ['payments', farmId] });
      queryClient.invalidateQueries({ queryKey: ['customers', farmId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries-checklist', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
    onError: (err) => {
      setPayFeedback({
        tone: 'error',
        msg: err instanceof ApiClientError ? err.message : 'Could not record payment.',
      });
    },
  });

  const voidPaymentMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      apiRequest(`/farms/${farmId}/payments/${paymentId}/void`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', farmId] });
      queryClient.invalidateQueries({ queryKey: ['customers', farmId] });
      queryClient.invalidateQueries({ queryKey: ['farm-dashboard', farmId] });
    },
  });

  const customers = customersQuery.data?.customers ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Customers &amp; Deliveries</h1>
          <p className="text-sm text-slate-600">
            Track daily milk deliveries, customer supply agreements, and KES payments.
          </p>
        </div>
        {canManageCustomers && (
          <Button type="button" onClick={openAddCustomer}>
            <Plus className="h-5 w-5" />
            Add Customer
          </Button>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'deliveries' })}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${
            activeTab === 'deliveries'
              ? 'bg-[#1b6b3a] text-white'
              : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          Daily Deliveries
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'customers' })}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${
            activeTab === 'customers'
              ? 'bg-[#1b6b3a] text-white'
              : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          Customers ({customers.length})
        </button>
        {(canViewPayments || canCreatePayments) && (
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'payments' })}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${
              activeTab === 'payments'
                ? 'bg-[#1b6b3a] text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            Payments
          </button>
        )}
      </div>

      {/* TAB 1: DAILY DELIVERIES */}
      {activeTab === 'deliveries' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:w-56">
              <Input
                label="Delivery Date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {deliveryFeedback && (
            <AlertBanner tone={deliveryFeedback.tone} message={deliveryFeedback.msg} />
          )}

          {checklistQuery.data && checklistQuery.data.supplyBalance.isSupplyShortage && (
            <AlertBanner
              tone="warning"
              title="Customer commitments exceed available milk"
              message={`Available for sale: ${formatLitres(checklistQuery.data.supplyBalance.availableForSaleLitres)} vs expected customer demand: ${formatLitres(checklistQuery.data.supplyBalance.totalCustomerDemandLitres)} (short by ${formatLitres(checklistQuery.data.supplyBalance.supplyShortageLitres)}).`}
            />
          )}

          {checklistQuery.isLoading ? (
            <div className="h-36 animate-pulse rounded-2xl bg-white border border-slate-200" />
          ) : checklistQuery.data?.checklist.length === 0 ? (
            <Card className="text-center py-8 space-y-2">
              <p className="font-bold text-slate-900">No active milk customers yet</p>
              <p className="text-sm text-slate-600">
                {canManageCustomers
                  ? 'Add your regular milk buyers to log daily deliveries with 1 tap.'
                  : 'Ask your farm owner to add customers so you can record daily deliveries.'}
              </p>
              {canManageCustomers && (
                <div className="pt-2">
                  <Button type="button" onClick={openAddCustomer}>
                    <Plus className="h-5 w-5" />
                    Add First Customer
                  </Button>
                </div>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {checklistQuery.data?.checklist.map((item) => (
                <Card key={item.customerId} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <InitialsAvatar
                        name={item.name}
                        size="md"
                        tone={item.isFulfilled ? 'green' : 'amber'}
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          {item.phone}
                          {item.location ? ` • ${item.location}` : ''} •{' '}
                          {formatKes(item.agreedPricePerLitre)}/L
                        </p>
                      </div>
                    </div>

                    <Badge tone={item.isFulfilled ? 'green' : 'amber'}>
                      {item.isFulfilled
                        ? `Delivered ${formatLitres(item.deliveredTodayLitres)}`
                        : `Expected ${formatLitres(item.expectedDailyLitres)}`}
                    </Badge>
                  </div>

                  {canCreateDelivery && (
                    <div className="flex flex-wrap gap-2">
                      {!item.isFulfilled && item.remainingLitres > 0 && (
                        <Button
                          type="button"
                          size="md"
                          loading={createDeliveryMutation.isPending}
                          onClick={() => {
                            setDeliveryFeedback(null);
                            createDeliveryMutation.mutate({
                              customerId: item.customerId,
                              quantityLitres: item.remainingLitres,
                              deliveryDate: selectedDate,
                            });
                          }}
                        >
                          <Check className="h-4 w-4" />
                          Deliver {formatLitres(item.remainingLitres)}
                        </Button>
                      )}

                      <Button
                        type="button"
                        size="md"
                        variant="outline"
                        onClick={() => {
                          setCustomDeliveryCust({
                            id: item.customerId,
                            name: item.name,
                            defaultLitres: item.remainingLitres || item.expectedDailyLitres || 1,
                          });
                          setCustomQty(
                            String(item.remainingLitres || item.expectedDailyLitres || 1),
                          );
                          setCustomNotes('');
                        }}
                      >
                        <Truck className="h-4 w-4" />
                        Custom Qty
                      </Button>
                    </div>
                  )}

                  {item.deliveries.length > 0 && (
                    <div className="rounded-xl bg-[#f6f9f4] px-3 py-2 text-xs text-slate-700 space-y-1">
                      {item.deliveries.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2">
                          <span>
                            {formatLitres(d.quantityLitres)} ({formatKes(d.totalAmountKes)}) • by{' '}
                            {d.recordedBy.fullName}
                          </span>
                          <Badge
                            tone={
                              d.paymentStatus === 'PAID'
                                ? 'green'
                                : d.paymentStatus === 'PARTIALLY_PAID'
                                  ? 'blue'
                                  : 'slate'
                            }
                          >
                            {d.paymentStatus.replace('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CUSTOMERS */}
      {activeTab === 'customers' && (
        <div className="space-y-3">
          {customersQuery.isLoading ? (
            <div className="h-32 animate-pulse rounded-2xl bg-white border border-slate-200" />
          ) : customers.length === 0 ? (
            <Card className="text-center py-8 space-y-2">
              <p className="font-bold text-slate-900">No customers registered</p>
              <p className="text-sm text-slate-600">
                Add customers with their agreed price per litre (KES) and daily quantity.
              </p>
            </Card>
          ) : (
            customers.map((c) => (
              <Card key={c.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={c.name} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{c.name}</p>
                        <Badge tone={c.status === 'ACTIVE' ? 'green' : 'slate'}>{c.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-600">
                        {c.phone}
                        {c.location ? ` • ${c.location}` : ''}
                      </p>
                    </div>
                  </div>

                  {c.balance && (
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-500">Outstanding Balance</p>
                      <p
                        className={`text-lg font-extrabold ${
                          c.balance.outstandingBalanceKes > 0
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatKes(c.balance.outstandingBalanceKes)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl bg-[#f6f9f4] p-3 text-xs">
                  <div>
                    <p className="text-slate-500">Agreed Price</p>
                    <p className="font-bold text-slate-900">
                      {formatKes(c.agreedPricePerLitre)}/L
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Daily Order</p>
                    <p className="font-bold text-slate-900">
                      {formatLitres(c.expectedDailyLitres)}
                    </p>
                  </div>
                  {c.balance && (
                    <>
                      <div>
                        <p className="text-slate-500">Total Billed</p>
                        <p className="font-bold text-slate-900">
                          {formatKes(c.balance.totalBilledKes)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Total Paid</p>
                        <p className="font-bold text-emerald-700">
                          {formatKes(c.balance.totalPaidKes)}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canCreatePayments && (
                    <Button
                      type="button"
                      size="md"
                      variant="secondary"
                      onClick={() => {
                        setPayCustomerId(c.id);
                        if (c.balance && c.balance.outstandingBalanceKes > 0) {
                          setPayAmount(String(c.balance.outstandingBalanceKes));
                        }
                        setSearchParams({ tab: 'payments' });
                      }}
                    >
                      <Banknote className="h-4 w-4" />
                      Record Payment
                    </Button>
                  )}

                  {canViewPayments && (
                    <Button
                      type="button"
                      size="md"
                      variant="outline"
                      onClick={() => setStatementCustomerId(c.id)}
                    >
                      <FileText className="h-4 w-4" />
                      Statement
                    </Button>
                  )}

                  {canManageCustomers && (
                    <Button
                      type="button"
                      size="md"
                      variant="ghost"
                      onClick={() => openEditCustomer(c)}
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* TAB 3: PAYMENTS */}
      {activeTab === 'payments' && (canViewPayments || canCreatePayments) && (
        <div className="space-y-5">
          {canCreatePayments && (
            <Card className="border-2 border-[#1b6b3a]/20">
              <h2 className="text-lg font-extrabold text-slate-900">Record Customer Payment</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Payments are automatically allocated to the customer&apos;s oldest unpaid deliveries.
              </p>

              {payFeedback && (
                <div className="mt-3">
                  <AlertBanner tone={payFeedback.tone} message={payFeedback.msg} />
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPayFeedback(null);
                  recordPaymentMutation.mutate();
                }}
                className="mt-4 space-y-4"
              >
                <div className="space-y-1.5">
                  <label htmlFor="pay-customer" className="block text-sm font-semibold text-slate-800">
                    Customer
                  </label>
                  <select
                    id="pay-customer"
                    value={payCustomerId}
                    onChange={(e) => setPayCustomerId(e.target.value)}
                    required
                    className="w-full min-h-[48px] rounded-xl border-2 border-slate-200 bg-white px-3.5 text-base font-semibold text-slate-900 focus:border-[#1b6b3a] focus:outline-none"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.balance ? ` (Owes ${formatKes(c.balance.outstandingBalanceKes)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Amount Received (KES)"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 1200"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                  />
                  <Input
                    label="Payment Date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="block text-sm font-semibold text-slate-800">Payment Method</span>
                  <div className="grid grid-cols-4 gap-2">
                    {(['MPESA', 'CASH', 'BANK', 'OTHER'] as PaymentMethod[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayMethod(m)}
                        className={`min-h-[44px] rounded-xl border-2 text-xs sm:text-sm font-bold ${
                          payMethod === m
                            ? 'border-[#1b6b3a] bg-[#e6f2ea] text-[#14532d]'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {m === 'MPESA' ? 'M-Pesa' : m.charAt(0) + m.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Reference / M-Pesa Code (Optional)"
                    placeholder="e.g. SJK82X9Q1P"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value.toUpperCase())}
                  />
                  <Input
                    label="Notes (Optional)"
                    placeholder="e.g. Weekly settlement"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                  />
                </div>

                <Button type="submit" loading={recordPaymentMutation.isPending} className="w-full">
                  Save Payment
                </Button>
              </form>
            </Card>
          )}

          {canViewPayments && (
            <Card>
              <h2 className="text-base font-bold text-slate-900 mb-3">Payment History</h2>
              {paymentsQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading payments...</p>
              ) : paymentsQuery.data?.payments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {paymentsQuery.data?.payments.map((p) => (
                    <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-emerald-700">
                            {formatKes(p.amountKes)}
                          </span>
                          <Badge tone="blue">{p.method === 'MPESA' ? 'M-Pesa' : p.method}</Badge>
                          <span className="font-semibold text-slate-900">{p.customer.name}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatNairobiDate(p.paymentDate)} • Recorded by {p.recordedBy.fullName}
                          {p.referenceCode ? ` • Ref: ${p.referenceCode}` : ''}
                        </p>
                      </div>

                      {canVoidPayments && !p.isVoided && (
                        <Button
                          type="button"
                          size="md"
                          variant="ghost"
                          onClick={() => {
                            const reason = window.prompt(
                              `Enter reason for voiding ${formatKes(p.amountKes)} from ${p.customer.name}:`,
                            );
                            if (reason && reason.trim().length >= 3) {
                              voidPaymentMutation.mutate({ paymentId: p.id, reason: reason.trim() });
                            }
                          }}
                        >
                          Void
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Custom Delivery Quantity Modal */}
      {customDeliveryCust && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-5 safe-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-extrabold text-slate-900">
                Deliver Milk to {customDeliveryCust.name}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setCustomDeliveryCust(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createDeliveryMutation.mutate({
                  customerId: customDeliveryCust.id,
                  quantityLitres: Number(customQty),
                  deliveryDate: selectedDate,
                  notes: customNotes.trim() || undefined,
                });
              }}
              className="mt-4 space-y-4"
            >
              <Input
                label="Quantity Delivered (Litres)"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0.1"
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value)}
                required
              />
              <Input
                label="Notes (Optional)"
                placeholder="e.g. Delivered in morning"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCustomDeliveryCust(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={createDeliveryMutation.isPending} className="flex-1">
                  Save Delivery
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white p-5 max-h-[92vh] overflow-y-auto safe-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-extrabold text-slate-900">
                {editingCustomer ? `Edit ${editingCustomer.name}` : 'Add Customer'}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setCustomerModalOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {custError && (
              <div className="mt-3">
                <AlertBanner tone="error" message={custError} />
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCustError(null);
                saveCustomerMutation.mutate();
              }}
              className="mt-4 space-y-4"
            >
              <Input
                label="Customer Name"
                placeholder="e.g. Mama Njeri Shop"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Phone Number (Kenya)"
                  type="tel"
                  placeholder="0712 345 678"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  required
                />
                <Input
                  label="Location (Optional)"
                  placeholder="e.g. Limuru Town"
                  value={custLocation}
                  onChange={(e) => setCustLocation(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Agreed Price per Litre (KES)"
                  type="number"
                  step="0.5"
                  min="1"
                  value={custPrice}
                  onChange={(e) => setCustPrice(e.target.value)}
                  required
                />
                <Input
                  label="Expected Daily Quantity (Litres)"
                  type="number"
                  step="0.5"
                  min="0"
                  value={custExpected}
                  onChange={(e) => setCustExpected(e.target.value)}
                  required
                />
              </div>

              {editingCustomer && (
                <div className="space-y-1.5">
                  <label htmlFor="cust-status" className="block text-sm font-semibold text-slate-800">
                    Status
                  </label>
                  <select
                    id="cust-status"
                    value={custStatus}
                    onChange={(e) => setCustStatus(e.target.value as CustomerStatus)}
                    className="w-full min-h-[48px] rounded-xl border-2 border-slate-200 bg-white px-3.5 text-base font-medium"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              )}

              <Input
                label="Supply Agreement Notes (Optional)"
                placeholder="e.g. Pays every Friday via M-Pesa"
                value={custNotes}
                onChange={(e) => setCustNotes(e.target.value)}
              />

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCustomerModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={saveCustomerMutation.isPending} className="flex-1">
                  {editingCustomer ? 'Save Changes' : 'Add Customer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Statement Modal */}
      {statementCustomerId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl bg-white p-5 max-h-[90vh] overflow-y-auto safe-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-extrabold text-slate-900">Customer Account Statement</h2>
              <button
                type="button"
                aria-label="Close statement"
                onClick={() => setStatementCustomerId(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {statementQuery.isLoading ? (
              <p className="py-6 text-sm text-slate-500">Loading statement...</p>
            ) : statementQuery.data ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl bg-[#f6f9f4] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{statementQuery.data.customer.name}</p>
                    <p className="text-xs text-slate-600">{statementQuery.data.customer.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Current Balance Owed</p>
                    <p className="text-xl font-extrabold text-[#1b6b3a]">
                      {formatKes(statementQuery.data.summary.outstandingBalanceKes)}
                    </p>
                  </div>
                </div>

                {statementQuery.data.lines.length === 0 ? (
                  <p className="text-sm text-slate-500">No deliveries or payments yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {statementQuery.data.lines.map((line) => (
                      <div key={line.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {line.description}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatNairobiDate(line.date)}
                            {line.reference ? ` • ${line.reference}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-bold ${
                              line.type === 'PAYMENT' ? 'text-emerald-700' : 'text-slate-900'
                            }`}
                          >
                            {line.type === 'PAYMENT'
                              ? `- ${formatKes(line.creditKes)}`
                              : `+ ${formatKes(line.debitKes)}`}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Bal: {formatKes(line.runningBalanceKes)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
