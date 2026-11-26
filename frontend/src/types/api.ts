export type AccountType = 'OWNER' | 'ASSISTANT';
export type RoleCode = 'FARM_OWNER' | 'FARM_ASSISTANT';
export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
export type LocaleCode = 'en' | 'sw';

export type AnimalOrigin = 'PURCHASED' | 'BORN_ON_FARM';
export type AnimalStatus = 'MILKING' | 'DRY' | 'PREGNANT' | 'SOLD' | 'DECEASED' | 'OTHER';
export type MilkingSession = 'MORNING' | 'EVENING';
export type CustomerStatus = 'ACTIVE' | 'PAUSED' | 'INACTIVE';
export type DeliveryStatus = 'DELIVERED' | 'PENDING' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
export type PaymentMethod = 'CASH' | 'MPESA' | 'BANK' | 'OTHER';

export interface UserProfile {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  accountType: AccountType;
  preferredLocale: string;
}

export interface FarmSummary {
  id: string;
  name: string;
  location: string | null;
  timezone: string;
  currency: string;
  milkDropAlertThresholdPct: number;
  milkDropBaselineDays: number;
  activeMembersCount?: number;
}

export interface FarmMembership {
  membershipId: string;
  farmId: string;
  farm: FarmSummary;
  role: {
    code: RoleCode;
    name: string;
  };
  permissions: string[];
  joinedAt: string;
}

export interface ConfigurablePermission {
  key: string;
  module: string;
  description: string;
}

export interface AuthSessionPayload {
  accessToken: string;
  user: UserProfile;
  memberships: FarmMembership[];
  configurablePermissions: ConfigurablePermission[];
}

export interface ProductionDropAlert {
  animalId: string;
  animalName: string;
  tagNumber: string;
  baselineAvgLitres: number;
  recentAvgLitres: number;
  dropPercent: number;
  thresholdPercent: number;
  baselineDaysUsed: number;
  message: string;
}

export interface DashboardActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string;
  actorPhone: string | null;
  createdAt: string;
}

export interface FarmDashboardData {
  farm: FarmSummary & { activeMembersCount: number };
  viewer: {
    roleCode: RoleCode;
    roleName: string;
    permissions: string[];
  };
  clock: {
    nairobiDate: string;
    nairobiLabel: string;
    timezone: string;
    currency: string;
  };
  herd: {
    totalActiveCows: number;
    milkingCowsCount: number;
    primaryCow: {
      id: string;
      name: string;
      tagNumber: string;
      breed: string;
      status: AnimalStatus;
      todayLitres: number;
    } | null;
  };
  milkToday: {
    morningLitres: number;
    eveningLitres: number;
    totalLitres: number;
    homeUseLitres: number;
    soldLitres: number;
    spoiledLitres: number;
    withheldLitres: number;
    availableForSaleLitres: number;
  };
  productionAlerts: ProductionDropAlert[];
  deliveriesToday: {
    completedCount: number;
    pendingCount: number;
    deliveredLitres: number;
    expectedDemandLitres: number;
    unfulfilledDemandLitres: number;
    supplyShortageLitres: number;
    isSupplyShortage: boolean;
  };
  outstandingBalances: {
    totalOutstandingKes: number;
    customersWithBalanceCount: number;
  } | null;
  team: {
    activeMembersCount: number;
    pendingInvitationsCount: number | null;
  };
  recentActivity: DashboardActivityItem[] | null;
}

export interface AnimalItem {
  id: string;
  farmId: string;
  name: string;
  tagNumber: string;
  breed: string;
  dateOfBirth: string | null;
  photoUrl: string | null;
  origin: AnimalOrigin;
  acquiredDate: string | null;
  purchasePriceKes: number | null;
  status: AnimalStatus;
  notes: string | null;
  archivedAt: string | null;
  todayLitres?: number;
  version: number;
}

export interface MilkRecordItem {
  id: string;
  farmId: string;
  animalId: string;
  animalName: string;
  animalTag: string;
  recordDate: string;
  session: MilkingSession;
  quantityLitres: number;
  homeUseLitres: number;
  soldLitres: number;
  spoiledLitres: number;
  availableForSaleLitres: number;
  isWithheld: boolean;
  notes: string | null;
  correctionReason: string | null;
  recordedBy: {
    id: string;
    fullName: string;
    phone: string;
  };
  version: number;
  createdAt: string;
}

export interface MilkSummaryData {
  nairobiDate: string;
  today: {
    morningLitres: number;
    eveningLitres: number;
    totalLitres: number;
    homeUseLitres: number;
    soldLitres: number;
    spoiledLitres: number;
    withheldLitres: number;
    availableForSaleLitres: number;
  };
  weeklyTotalLitres: number;
  monthly: {
    totalLitres: number;
    homeUseLitres: number;
    soldLitres: number;
    spoiledLitres: number;
    averageDailyLitres: number;
    recordedDays: number;
  };
  dailyTrend: {
    date: string;
    morningLitres: number;
    eveningLitres: number;
    totalLitres: number;
  }[];
  productionAlerts: ProductionDropAlert[];
}

export interface SupplyBalanceData {
  date: string;
  totalProducedLitres: number;
  homeUseLitres: number;
  spoiledLitres: number;
  withheldLitres: number;
  availableForSaleLitres: number;
  totalCustomerDemandLitres: number;
  deliveredLitres: number;
  pendingDeliveryLitres: number;
  unfulfilledDemandLitres: number;
  supplyShortageLitres: number;
  isSupplyShortage: boolean;
}

export interface CustomerBalanceSummary {
  totalBilledKes: number;
  totalPaidKes: number;
  outstandingBalanceKes: number;
  creditBalanceKes: number;
}

export interface CustomerItem {
  id: string;
  farmId: string;
  name: string;
  phone: string;
  location: string | null;
  agreedPricePerLitre: number;
  expectedDailyLitres: number;
  agreementNotes: string | null;
  status: CustomerStatus;
  balance: CustomerBalanceSummary | null;
  version: number;
}

export interface MilkDeliveryItem {
  id: string;
  farmId: string;
  customerId: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    location: string | null;
  };
  deliveryDate: string;
  quantityLitres: number;
  unitPriceKes: number;
  totalAmountKes: number;
  paidAmountKes: number;
  deliveryStatus: DeliveryStatus;
  paymentStatus: PaymentStatus;
  notes: string | null;
  recordedBy: {
    id: string;
    fullName: string;
  };
  version: number;
  createdAt: string;
}

export interface DailyChecklistItem {
  customerId: string;
  name: string;
  phone: string;
  location: string | null;
  agreedPricePerLitre: number;
  expectedDailyLitres: number;
  deliveredTodayLitres: number;
  pendingTodayLitres: number;
  remainingLitres: number;
  isFulfilled: boolean;
  deliveries: MilkDeliveryItem[];
}

export interface DailyChecklistResponse {
  date: string;
  supplyBalance: SupplyBalanceData;
  checklist: DailyChecklistItem[];
}

export interface PaymentItem {
  id: string;
  farmId: string;
  customerId: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  paymentDate: string;
  amountKes: number;
  method: PaymentMethod;
  referenceCode: string | null;
  notes: string | null;
  isVoided: boolean;
  voidReason: string | null;
  voidedAt: string | null;
  recordedBy: {
    id: string;
    fullName: string;
  };
  createdAt: string;
}

export interface CustomerStatementData {
  customer: {
    id: string;
    name: string;
    phone: string;
    location: string | null;
    agreedPricePerLitre: number;
    expectedDailyLitres: number;
  };
  summary: CustomerBalanceSummary;
  lines: {
    id: string;
    date: string;
    type: 'DELIVERY' | 'PAYMENT';
    description: string;
    debitKes: number;
    creditKes: number;
    reference: string | null;
    runningBalanceKes: number;
  }[];
}

export interface FarmMemberItem {
  membershipId: string;
  status: MembershipStatus;
  joinedAt: string;
  user: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    accountType: AccountType;
    lastLoginAt: string | null;
  };
  role: {
    code: RoleCode;
    name: string;
  };
  effectivePermissions: string[];
  configurablePermissions: Record<string, boolean>;
}

export interface FarmInvitationItem {
  id: string;
  phone: string;
  inviteeName: string | null;
  grantedPermissions: string[];
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedByName: string;
  createdAt: string;
}

export interface CreatedInvitationResponse {
  id: string;
  phone: string;
  inviteeName: string | null;
  grantedPermissions: string[];
  inviteCode: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeData: unknown;
  afterData: unknown;
  actor: {
    id: string;
    fullName: string;
    phone: string;
  } | null;
  createdAt: string;
}
