import { API_URL, REQUEST_TIMEOUT_MS } from '../config';
import { ApiError } from './errors';
import { clearTokens, getTokens, loadTokens, saveTokens } from './tokens';
import type { TokenPair } from './types';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | undefined>;
  /** true — с токеном и обновлением по 401; 'optional' — токен, если есть, без обновления; false — без токена. */
  auth?: boolean | 'optional';
  timeoutMs?: number;
}

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) {
  onSessionExpired = fn;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${API_URL}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, o: RequestOptions, token?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    // Для multipart Content-Type не задаём: boundary подставит сам fetch.
    return await fetch(buildUrl(path, o.query), {
      method: o.method ?? 'GET',
      headers,
      body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'timeout', 'Сервер не отвечает. Попробуйте ещё раз.');
    }
    throw new ApiError(0, 'network', 'Нет связи с сервером. Проверьте интернет.');
  } finally {
    clearTimeout(timer);
  }
}

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function fallbackMessage(status: number) {
  if (status === 413) return 'Фото больше 10 МБ.';
  if (status === 429) return 'Слишком много попыток. Подождите минуту.';
  if (status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

function toError(res: Response, data: unknown): ApiError {
  const d = data as { code?: unknown; message?: unknown; details?: unknown } | undefined;
  if (d && typeof d === 'object' && typeof d.code === 'string') {
    return new ApiError(
      res.status,
      d.code,
      typeof d.message === 'string' ? d.message : fallbackMessage(res.status),
      d.details,
    );
  }
  return new ApiError(res.status, `http_${res.status}`, fallbackMessage(res.status));
}

async function handle<T>(res: Response): Promise<T> {
  const data = await parse(res);
  if (!res.ok) throw toError(res, data);
  return data as T;
}

// --- Обновление токена ------------------------------------------------------
// Один обновляющий запрос на всех: старый refresh после использования недействителен,
// а повторное его предъявление отзывает все токены пользователя.
let refreshing: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const t = getTokens();
  if (!t) throw new ApiError(401, 'no_session', 'Войдите в аккаунт.');
  const res = await send('/auth/refresh', { method: 'POST', body: { refresh_token: t.refresh } });
  const data = await parse(res);
  if (!res.ok) {
    // Сбой сервера или лимит — сессия может быть жива, токены не трогаем.
    if (res.status >= 500 || res.status === 429) throw toError(res, data);
    await clearTokens();
    onSessionExpired?.();
    throw toError(res, data);
  }
  const pair = data as TokenPair;
  await saveTokens({ access: pair.access_token, refresh: pair.refresh_token });
  return pair.access_token;
}

function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function request<T = void>(path: string, o: RequestOptions = {}): Promise<T> {
  const auth = o.auth ?? true;

  if (auth === false) return handle<T>(await send(path, o));

  await loadTokens();
  const tokens = getTokens();

  if (auth === 'optional') return handle<T>(await send(path, o, tokens?.access));

  if (!tokens) {
    onSessionExpired?.();
    throw new ApiError(401, 'no_session', 'Войдите в аккаунт.');
  }

  const used = tokens.access;
  let res = await send(path, o, used);
  if (res.status === 401) {
    const current = getTokens();
    // Если пока мы ждали, соседний запрос уже обновил токен — берём его.
    const fresh = current && current.access !== used ? current.access : await refreshAccessToken();
    res = await send(path, o, fresh);
  }
  return handle<T>(res);
}
