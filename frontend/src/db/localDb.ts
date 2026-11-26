import Dexie, { Table } from 'dexie';

export type LocalSyncStatus = 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_FAILED' | 'CONFLICT';

export interface SyncOutboxItem {
  clientMutationId: string;
  farmId: string;
  entityType: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'ARCHIVE';
  payload: unknown;
  baseVersion?: number;
  status: LocalSyncStatus;
  retryCount: number;
  lastError?: string;
  createdAt: string;
}

export interface LocalMetaEntry {
  key: string;
  value: unknown;
  updatedAt: string;
}

/**
 * IndexedDB foundation using Dexie.js.
 * Phase 1 initializes local metadata & outbox tables; Phases 2-5 expand domain entity stores.
 */
class MooFarmLocalDb extends Dexie {
  syncOutbox!: Table<SyncOutboxItem, string>;
  meta!: Table<LocalMetaEntry, string>;

  constructor() {
    super('moo-farm-local-v1');
    this.version(1).stores({
      syncOutbox: 'clientMutationId, farmId, entityType, status, createdAt',
      meta: 'key',
    });
  }
}

export const localDb = new MooFarmLocalDb();
