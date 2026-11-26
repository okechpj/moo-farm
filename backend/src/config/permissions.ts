import { RoleCode } from '@prisma/client';

export interface PermissionDefinition {
  key: string;
  module: string;
  description: string;
  assistantDefault: boolean;
  isAssistantConfigurable: boolean;
}

export const PERMISSIONS: readonly PermissionDefinition[] = [
  // Farm & Settings
  { key: 'farm.view', module: 'farm', description: 'View farm profile and operational overview', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'farm.manage', module: 'farm', description: 'Create, update, or archive farm', assistantDefault: false, isAssistantConfigurable: false },
  { key: 'settings.manage', module: 'settings', description: 'Configure farm settings and alert thresholds', assistantDefault: false, isAssistantConfigurable: false },
  { key: 'users.manage', module: 'users', description: 'Invite, suspend, remove assistants and manage permissions', assistantDefault: false, isAssistantConfigurable: false },
  { key: 'audit.view', module: 'audit', description: 'View farm activity and audit history', assistantDefault: false, isAssistantConfigurable: false },

  // Animals
  { key: 'animals.view', module: 'animals', description: 'View cow profiles and herd details', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'animals.create', module: 'animals', description: 'Add new cows to the herd', assistantDefault: false, isAssistantConfigurable: false },
  { key: 'animals.update', module: 'animals', description: 'Edit cow details and status', assistantDefault: false, isAssistantConfigurable: false },
  { key: 'animals.archive', module: 'animals', description: 'Archive cow records', assistantDefault: false, isAssistantConfigurable: false },

  // Milk Production
  { key: 'milk.view', module: 'milk', description: 'View milk production records and summaries', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'milk.create', module: 'milk', description: 'Record morning and evening milk production', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'milk.update', module: 'milk', description: 'Correct historical milk production records', assistantDefault: false, isAssistantConfigurable: true },

  // Customers & Deliveries
  { key: 'customers.view', module: 'customers', description: 'View customer profiles and delivery schedules', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'customers.manage', module: 'customers', description: 'Manage customers, milk prices, and agreements', assistantDefault: false, isAssistantConfigurable: false },
  { key: 'deliveries.view', module: 'deliveries', description: 'View milk delivery records', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'deliveries.create', module: 'deliveries', description: 'Record customer milk deliveries', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'deliveries.update', module: 'deliveries', description: 'Modify or cancel customer deliveries', assistantDefault: false, isAssistantConfigurable: false },

  // Payments
  { key: 'payments.view', module: 'payments', description: 'View customer balances and payment history', assistantDefault: false, isAssistantConfigurable: true },
  { key: 'payments.create', module: 'payments', description: 'Record customer payments received', assistantDefault: false, isAssistantConfigurable: true },
  { key: 'payments.manage', module: 'payments', description: 'Void or adjust historical payment records', assistantDefault: false, isAssistantConfigurable: false },

  // Health & Observations
  { key: 'health.view', module: 'health', description: 'View animal health, vaccinations, and withdrawal alerts', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'health.create', module: 'health', description: 'Record daily cow mood, appetite, water intake, and health observations', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'health.manage', module: 'health', description: 'Manage vaccinations, treatments, and withdrawal periods', assistantDefault: false, isAssistantConfigurable: false },

  // Breeding
  { key: 'breeding.view', module: 'breeding', description: 'View breeding status and calving reminders', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'breeding.manage', module: 'breeding', description: 'Record heat, insemination, pregnancy, and calving events', assistantDefault: false, isAssistantConfigurable: false },

  // Feed
  { key: 'feed.view', module: 'feed', description: 'View feed stock and feeding history', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'feed.create', module: 'feed', description: 'Record daily cow feeding', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'feed.manage', module: 'feed', description: 'Manage feed types, restocking, and thresholds', assistantDefault: false, isAssistantConfigurable: false },

  // Expenses & Finance
  { key: 'expenses.view', module: 'expenses', description: 'View farm expenses and financial summaries', assistantDefault: false, isAssistantConfigurable: false },
  { key: 'expenses.manage', module: 'expenses', description: 'Record or void farm expenses and other income', assistantDefault: false, isAssistantConfigurable: false },

  // Tasks & Notifications
  { key: 'tasks.view', module: 'tasks', description: 'View assigned farm tasks and reminders', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'tasks.complete', module: 'tasks', description: 'Mark assigned farm tasks as complete', assistantDefault: true, isAssistantConfigurable: false },
  { key: 'tasks.manage', module: 'tasks', description: 'Create, assign, and manage farm tasks', assistantDefault: false, isAssistantConfigurable: false },

  // Reports
  { key: 'reports.view', module: 'reports', description: 'View financial and operational analytics reports', assistantDefault: false, isAssistantConfigurable: false },
  { key: 'reports.export', module: 'reports', description: 'Export farm reports to PDF and Excel', assistantDefault: false, isAssistantConfigurable: false },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ASSISTANT_CONFIGURABLE_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.filter(
  (p) => p.isAssistantConfigurable,
).map((p) => p.key);

export const ROLE_DEFINITIONS: readonly {
  code: RoleCode;
  name: string;
  description: string;
}[] = [
  {
    code: RoleCode.FARM_OWNER,
    name: 'Farm Owner',
    description: 'Full administrative access to farm operations, finances, team, and settings.',
  },
  {
    code: RoleCode.FARM_ASSISTANT,
    name: 'Farm Assistant',
    description: 'Operational access to daily milking, deliveries, feeding, and animal observations.',
  },
];
