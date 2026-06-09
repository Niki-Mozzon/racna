import { afterEach, beforeEach, vi } from 'vitest';

type StorageArea = 'sync' | 'local' | 'session' | 'managed';
type StorageStore = Record<string, unknown>;

const stores: Record<StorageArea, StorageStore> = {
  sync: {},
  local: {},
  session: {},
  managed: {},
};

function makeStorageArea(area: StorageArea) {
  return {
    get: vi.fn(
      (
        keys: string | string[] | Record<string, unknown> | null | undefined,
      ): Promise<Record<string, unknown>> => {
        const store = stores[area];
        if (keys == null) return Promise.resolve({ ...store });
        if (typeof keys === 'string') {
          return Promise.resolve(keys in store ? { [keys]: store[keys] } : {});
        }
        if (Array.isArray(keys)) {
          const out: Record<string, unknown> = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return Promise.resolve(out);
        }
        const out: Record<string, unknown> = { ...keys };
        for (const k of Object.keys(keys)) if (k in store) out[k] = store[k];
        return Promise.resolve(out);
      },
    ),
    set: vi.fn((items: Record<string, unknown>): Promise<void> => {
      Object.assign(stores[area], items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]): Promise<void> => {
      const list = Array.isArray(keys) ? keys : [keys];
      const store = stores[area];
      for (const k of list) Reflect.deleteProperty(store, k);
      return Promise.resolve();
    }),
    clear: vi.fn((): Promise<void> => {
      stores[area] = {};
      return Promise.resolve();
    }),
  };
}

const chromeMock = {
  storage: {
    sync: makeStorageArea('sync'),
    local: makeStorageArea('local'),
    session: makeStorageArea('session'),
    managed: makeStorageArea('managed'),
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
    },
  },
  runtime: {
    id: 'racna-test',
    getURL: vi.fn((path: string) => `chrome-extension://racna-test/${path}`),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
    },
    lastError: undefined as { message: string } | undefined,
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([])),
    sendMessage: vi.fn(() => Promise.resolve()),
  },
};

beforeEach(() => {
  (globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;
});

afterEach(() => {
  for (const area of Object.keys(stores) as StorageArea[]) {
    stores[area] = {};
  }
  vi.clearAllMocks();
});
