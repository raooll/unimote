import { API_PREFIX } from '../config';
import { useAuth } from '../store/auth';
import { useSettings } from '../store/settings';
import type {
  Brand,
  Category,
  MatchCandidate,
  ModelSummary,
  PageMeta,
  Remote,
  SubmissionInput,
  SyncPayload,
  SyncSnapshot,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

/** Without a timeout a wrong/unreachable address leaves the UI loading forever. */
const REQUEST_TIMEOUT_MS = 25_000;
/** Reads are safe to repeat: one automatic retry hides a dropped connection or a slow first byte. */
const GET_ATTEMPTS = 2;

type Query = Record<string, string | number | undefined>;

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ data: T; status: number; headers: Headers }> {
  const { apiUrl, installId } = useSettings.getState();
  const token = useAuth.getState().token;
  const qs = Object.entries(opts.query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${apiUrl}${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;

  let res: Response | undefined;
  const attempts = method === 'GET' ? GET_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attempts && !res; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(url, {
        signal: controller.signal,
        method,
        headers: {
          Accept: 'application/json',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          'X-Install-Id': installId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...opts.headers,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      if (attempt === attempts) {
        throw new ApiError(0, 'network', `Cannot reach the server${__DEV__ ? ` at ${apiUrl}` : ''}. Check your connection.`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (!res) throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection.');

  if (res.status === 204 || res.status === 304) {
    return { data: undefined as T, status: res.status, headers: res.headers };
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = json?.error;
    if (res.status === 401 && token && err?.code === 'unauthorized') {
      useAuth.getState().clear(); // token expired or revoked
    }
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return { data: json as T, status: res.status, headers: res.headers };
}

export const api = {
  categories: async () =>
    (await request<{ categories: Category[] }>('GET', '/categories')).data.categories,

  brands: async (p: { category?: string; q?: string; page?: number; per_page?: number }) =>
    (await request<{ brands: Brand[]; meta: PageMeta }>('GET', '/brands', { query: p })).data,

  models: async (p: { category?: string; brand?: string; q?: string; page?: number; per_page?: number }) =>
    (await request<{ models: ModelSummary[]; meta: PageMeta }>('GET', '/models', { query: p })).data,

  match: async (p: { category: string; brand?: string; model?: string; protocol?: string }) =>
    (await request<{ candidates: MatchCandidate[] }>('GET', '/remotes/match', { query: p })).data.candidates,

  remote: async (id: number) => (await request<{ remote: Remote }>('GET', `/remotes/${id}`)).data.remote,

  report: async (remoteId: number, worked: boolean) => {
    await request('POST', `/remotes/${remoteId}/reports`, { body: { worked } });
  },

  signUp: async (user: { email: string; password: string; name?: string }) =>
    (await request<{ user: User; token: string }>('POST', '/auth/sign_up', { body: { user } })).data,

  signIn: async (user: { email: string; password: string }) =>
    (await request<{ user: User; token: string }>('POST', '/auth/sign_in', { body: { user } })).data,

  signOut: async () => {
    await request('DELETE', '/auth/sign_out');
  },

  requestPasswordReset: async (email: string) => {
    await request('POST', '/auth/password', { body: { email } });
  },

  /** Permanently deletes the account and its synced data. Local data on the phone is untouched. */
  deleteAccount: async () => {
    await request('DELETE', '/me');
  },

  /** Merge everything given into the account and return the full account snapshot. */
  sync: async (payload: SyncPayload) => (await request<SyncSnapshot>('POST', '/sync', { body: payload })).data,

  deleteSynced: async (collection: 'rooms' | 'saved_remotes' | 'scenes', clientUuid: string) => {
    try {
      await request('DELETE', `/${collection}/${encodeURIComponent(clientUuid)}`);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e; // already gone is fine
    }
  },

  requestModel: async (r: { brand_name: string; model_name?: string; category: string; notes?: string }) =>
    (await request<{ id: number; status: string; requests_count: number }>('POST', '/model_requests', { body: { model_request: r } })).data,

  submitRemote: async (submission: SubmissionInput) =>
    (await request<{ id: number; status: string }>('POST', '/submissions', { body: { submission } })).data,
};
