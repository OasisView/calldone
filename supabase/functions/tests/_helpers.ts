// supabase/functions/tests/_helpers.ts
// Test-only fakes: a chainable fake Supabase client and fetch stubs. Providers are
// mocked at the fetch layer (R21). Nothing here ships to the runtime.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FakeUser {
  id: string;
  is_anonymous?: boolean;
  email?: string | null;
}

export interface FakeTableData {
  /** rows for select/maybeSingle/single, keyed loosely; we just return the first
   *  matching row by the recorded eq() filters. */
  rows: Record<string, unknown>[];
}

export interface FakeClientOptions {
  /** auth.getUser() result. null user → unauthenticated (bare anon key). */
  user?: FakeUser | null;
  authError?: boolean;
  /** rate_limit_hit(bucket) → returned count. Default 1 (under all limits). */
  rpcCounts?: Record<string, number>;
  /** table name → seed rows for select(). */
  tables?: Record<string, Record<string, unknown>[]>;
  /** capture inserts/updates. */
  inserted?: Record<string, Record<string, unknown>[]>;
  updated?: Record<string, Record<string, unknown>[]>;
  /** admin.getUserById id → user (with email). */
  adminUsers?: Record<string, FakeUser>;
  /** force errors */
  insertError?: boolean;
  updateError?: boolean;
}

interface QueryState {
  table: string;
  filters: Record<string, unknown>;
  insertRow?: Record<string, unknown>;
  updateRow?: Record<string, unknown>;
}

/** Builds a chainable fake that mimics the subset of supabase-js used by the
 *  functions: from().select().eq().maybeSingle()/.single(), insert().select().single(),
 *  update().eq().eq(), rpc(), auth.getUser(), auth.admin.getUserById(). */
export function makeFakeClient(opts: FakeClientOptions): SupabaseClient {
  opts.inserted ??= {};
  opts.updated ??= {};

  function makeQuery(state: QueryState) {
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = (col: string, val: unknown) => {
      state.filters[col] = val;
      return api;
    };
    api.maybeSingle = () => Promise.resolve(resolveSelect(state));
    api.single = () => {
      if (state.insertRow) return Promise.resolve(resolveInsert(state));
      return Promise.resolve(resolveSelect(state));
    };
    // Awaiting a bare select chain (no single/maybeSingle) resolves ALL matches,
    // mirroring supabase-js list queries (used by kb.ts).
    api.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      if (state.insertRow) {
        return Promise.resolve(resolveInsert(state)).then(resolve, reject);
      }
      const rows = (opts.tables?.[state.table] ?? []).filter((r) =>
        Object.entries(state.filters).every(([k, v]) => r[k] === v)
      );
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    };
    return api;
  }

  function resolveSelect(state: QueryState) {
    const rows = opts.tables?.[state.table] ?? [];
    const match = rows.find((r) =>
      Object.entries(state.filters).every(([k, v]) => r[k] === v)
    );
    return { data: match ?? null, error: null };
  }

  function resolveInsert(state: QueryState) {
    if (opts.insertError) return { data: null, error: { message: "insert failed" } };
    const row = { id: state.insertRow?.id ?? crypto.randomUUID(), ...state.insertRow };
    (opts.inserted![state.table] ??= []).push(row);
    return { data: row, error: null };
  }

  const client = {
    from(table: string) {
      const state: QueryState = { table, filters: {} };
      const base = makeQuery(state);
      base.insert = (row: Record<string, unknown>) => {
        state.insertRow = row;
        return makeQuery(state);
      };
      base.update = (row: Record<string, unknown>) => {
        state.updateRow = row;
        const upd: Record<string, unknown> = {};
        upd.eq = (col: string, val: unknown) => {
          state.filters[col] = val;
          return upd;
        };
        upd.then = (resolve: (v: unknown) => unknown) => {
          if (opts.updateError) {
            return Promise.resolve({ error: { message: "update failed" } }).then(resolve);
          }
          (opts.updated![table] ??= []).push({ ...state.filters, ...row });
          return Promise.resolve({ error: null }).then(resolve);
        };
        return upd;
      };
      return base;
    },
    rpc(fn: string, params?: { p_bucket?: string }) {
      // rate_limit_hit keys by bucket; other RPCs (usage_add_minutes) by name.
      const key = params?.p_bucket ?? fn;
      const count = opts.rpcCounts?.[key] ?? (params?.p_bucket ? 1 : 0);
      return Promise.resolve({ data: count, error: null });
    },
    auth: {
      getUser() {
        if (opts.authError) return Promise.resolve({ data: { user: null }, error: { message: "bad jwt" } });
        return Promise.resolve({ data: { user: opts.user ?? null }, error: null });
      },
      admin: {
        getUserById(id: string) {
          const u = opts.adminUsers?.[id];
          if (!u) return Promise.resolve({ data: { user: null }, error: null });
          return Promise.resolve({ data: { user: u }, error: null });
        },
      },
    },
  };
  return client as unknown as SupabaseClient;
}

/** A fetch stub that returns a fixed Response, recording calls. */
export function stubFetch(
  responder: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { fetch: typeof fetch; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return Promise.resolve(responder(url, init));
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

/** Sets the env vars functions read, restoring afterward. */
export function withEnv(vars: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = Deno.env.get(k);
    Deno.env.set(k, v);
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  });
}

export const TEST_ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
};
