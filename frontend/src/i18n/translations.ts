import { LocaleCode } from '../types/api';
import { useAuthStore } from '../stores/authStore';

const en = {
  appName: 'Moo Farm',
  tagline: 'Your digital dairy farm assistant',
  online: 'Online',
  offline: 'Offline',
  nav: {
    dashboard: 'Dashboard',
    cows: 'My Cows',
    milk: 'Milk Records',
    customers: 'Customers',
    health: 'Health',
    expenses: 'Expenses',
    feed: 'Feed',
    reports: 'Reports',
    settings: 'Settings',
    more: 'More',
  },
  auth: {
    loginTitle: 'Welcome back',
    loginSubtitle: 'Sign in with your phone number (or email for owners)',
    registerTitle: 'Create Farm Owner Account',
    registerSubtitle: 'Set up your dairy farm in less than a minute',
    joinTitle: 'Join Farm as Assistant',
    joinSubtitle: 'Use your phone number and the invite code from the farm owner',
    phoneLabel: 'Phone Number (Kenya)',
    identifierLabel: 'Phone Number or Email',
    emailOptionalLabel: 'Email (Optional)',
    fullNameLabel: 'Full Name',
    passwordLabel: 'Password',
    farmNameLabel: 'Farm Name',
    farmLocationLabel: 'Farm Location (Optional)',
    inviteCodeLabel: 'Invite Code',
    signIn: 'Sign In',
    createAccount: 'Create Account & Farm',
    joinFarm: 'Join Farm',
    logout: 'Log Out',
  },
  roles: {
    FARM_OWNER: 'Farm Owner',
    FARM_ASSISTANT: 'Farm Assistant',
  },
  dashboard: {
    greeting: 'Farm Overview',
    activeTeam: 'Team Members',
    pendingInvites: 'Pending Invites',
    recentActivity: 'Recent Farm Activity',
    noActivity: 'No activity recorded yet.',
    nextPhaseNote: 'Core foundation active. Cow profiles, milking, deliveries, and health modules arrive in Phases 2–4.',
  },
  settings: {
    title: 'Farm Settings & Team',
    farmTab: 'Farm Profile',
    teamTab: 'Team & Assistants',
    auditTab: 'Activity Log',
    accountTab: 'My Account',
  },
} as const;

const sw: Record<string, unknown> = {
  appName: 'Moo Farm',
  tagline: 'Msaidizi wako wa ufugaji wa ng’ombe wa maziwa',
  online: 'Mtandaoni',
  offline: 'Nje ya mtandao',
  nav: {
    dashboard: 'Muhtasari',
    cows: 'Ng’ombe Wangu',
    milk: 'Maziwa',
    customers: 'Wateja',
    health: 'Afya',
    expenses: 'Gharama',
    feed: 'Chakula',
    reports: 'Ripoti',
    settings: 'Mipangilio',
    more: 'Zaidi',
  },
  auth: {
    loginTitle: 'Karibu tena',
    loginSubtitle: 'Ingia kwa nambari yako ya simu',
    registerTitle: 'Fungua Akaunti ya Mmiliki',
    registerSubtitle: 'Anza kusimamia shamba lako la maziwa kwa urahisi',
    joinTitle: 'Jiunge kama Msaidizi',
    joinSubtitle: 'Tumia nambari yako ya simu na nambari ya mwaliko kutoka kwa mmiliki',
    phoneLabel: 'Nambari ya Simu (Kenya)',
    identifierLabel: 'Nambari ya Simu au Barua Pepe',
    emailOptionalLabel: 'Barua Pepe (Hiari)',
    fullNameLabel: 'Jina Kamili',
    passwordLabel: 'Nenosiri',
    farmNameLabel: 'Jina la Shamba',
    farmLocationLabel: 'Mahali pa Shamba (Hiari)',
    inviteCodeLabel: 'Nambari ya Mwaliko',
    signIn: 'Ingia',
    createAccount: 'Fungua Akaunti na Shamba',
    joinFarm: 'Jiunge na Shamba',
    logout: 'Toka',
  },
  roles: {
    FARM_OWNER: 'Mmiliki wa Shamba',
    FARM_ASSISTANT: 'Msaidizi wa Shamba',
  },
  dashboard: {
    greeting: 'Muhtasari wa Shamba',
    activeTeam: 'Wafanyakazi',
    pendingInvites: 'Mialiko Inayosubiri',
    recentActivity: 'Shughuli za Hivi Karibuni',
    noActivity: 'Hakuna shughuli bado.',
    nextPhaseNote: 'Msingi uko tayari. Moduli za ng’ombe, maziwa, wateja na afya zitafuata.',
  },
  settings: {
    title: 'Mipangilio ya Shamba',
    farmTab: 'Wasifu wa Shamba',
    teamTab: 'Timu na Wasaidizi',
    auditTab: 'Rekodi ya Shughuli',
    accountTab: 'Akaunti Yangu',
  },
};

export type TranslationDict = typeof en;

export function getTranslations(locale: LocaleCode): TranslationDict {
  return (locale === 'sw' ? sw : en) as TranslationDict;
}

export function useT(): TranslationDict {
  const locale = useAuthStore((s) => s.locale);
  return getTranslations(locale);
}
