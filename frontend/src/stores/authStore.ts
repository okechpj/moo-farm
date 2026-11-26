import { create } from 'zustand';
import {
  AuthSessionPayload,
  ConfigurablePermission,
  FarmMembership,
  LocaleCode,
  UserProfile,
} from '../types/api';

const ACTIVE_FARM_STORAGE_KEY = 'moo_active_farm_id';
const LOCALE_STORAGE_KEY = 'moo_locale';

interface AuthState {
  accessToken: string | null;
  user: UserProfile | null;
  memberships: FarmMembership[];
  activeFarmId: string | null;
  configurablePermissions: ConfigurablePermission[];
  locale: LocaleCode;
  isOnline: boolean;
  isBootstrapping: boolean;

  setSession: (payload: AuthSessionPayload) => void;
  updateMemberships: (memberships: FarmMembership[]) => void;
  setActiveFarmId: (farmId: string) => void;
  setLocale: (locale: LocaleCode) => void;
  setOnline: (online: boolean) => void;
  setBootstrapping: (bootstrapping: boolean) => void;
  clearSession: () => void;

  getActiveMembership: () => FarmMembership | null;
  hasPermission: (permissionKey: string) => boolean;
}

function loadSavedLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    return saved === 'sw' ? 'sw' : 'en';
  } catch {
    return 'en';
  }
}

function loadSavedFarmId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_FARM_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  memberships: [],
  activeFarmId: loadSavedFarmId(),
  configurablePermissions: [],
  locale: loadSavedLocale(),
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isBootstrapping: true,

  setSession: (payload) => {
    const savedFarmId = get().activeFarmId ?? loadSavedFarmId();
    const validSaved = payload.memberships.find((m) => m.farmId === savedFarmId);
    const nextFarmId = validSaved?.farmId ?? payload.memberships[0]?.farmId ?? null;

    if (nextFarmId) {
      try {
        localStorage.setItem(ACTIVE_FARM_STORAGE_KEY, nextFarmId);
      } catch {
        // Ignore storage errors in private browsing
      }
    }

    const nextLocale: LocaleCode =
      payload.user.preferredLocale === 'sw' ? 'sw' : get().locale;

    set({
      accessToken: payload.accessToken,
      user: payload.user,
      memberships: payload.memberships,
      activeFarmId: nextFarmId,
      configurablePermissions: payload.configurablePermissions,
      locale: nextLocale,
      isBootstrapping: false,
    });
  },

  updateMemberships: (memberships) => {
    const current = get().activeFarmId;
    const stillValid = memberships.find((m) => m.farmId === current);
    const nextFarmId = stillValid?.farmId ?? memberships[0]?.farmId ?? null;

    if (nextFarmId) {
      try {
        localStorage.setItem(ACTIVE_FARM_STORAGE_KEY, nextFarmId);
      } catch {
        // ignore
      }
    }

    set({ memberships, activeFarmId: nextFarmId });
  },

  setActiveFarmId: (farmId) => {
    try {
      localStorage.setItem(ACTIVE_FARM_STORAGE_KEY, farmId);
    } catch {
      // ignore
    }
    set({ activeFarmId: farmId });
  },

  setLocale: (locale) => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore
    }
    set({ locale });
  },

  setOnline: (isOnline) => set({ isOnline }),
  setBootstrapping: (isBootstrapping) => set({ isBootstrapping }),

  clearSession: () => {
    set({
      accessToken: null,
      user: null,
      memberships: [],
      activeFarmId: null,
      isBootstrapping: false,
    });
  },

  getActiveMembership: () => {
    const { memberships, activeFarmId } = get();
    if (!memberships.length) return null;
    return memberships.find((m) => m.farmId === activeFarmId) ?? memberships[0];
  },

  hasPermission: (permissionKey) => {
    const active = get().getActiveMembership();
    if (!active) return false;
    return active.permissions.includes(permissionKey);
  },
}));
