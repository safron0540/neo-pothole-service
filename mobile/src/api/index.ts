import { ANALYZE_TIMEOUT_MS } from '../config';
import type { Report } from '../types';
import { request } from './client';
import { toReport } from './mappers';
import { saveTokens } from './tokens';
import type { AnalyzeResult, CreateRequestBody, Page, RegisterBody, TokenPair } from './types';

export { ApiError, errorMessage } from './errors';
export { setSessionExpiredHandler } from './client';

// --- Авторизация ------------------------------------------------------------
export async function register(body: RegisterBody): Promise<void> {
  const pair = await request<TokenPair>('/auth/citizen/register', { method: 'POST', body, auth: false });
  await saveTokens({ access: pair.access_token, refresh: pair.refresh_token });
}

export async function login(email: string, password: string): Promise<void> {
  const pair = await request<TokenPair>('/auth/citizen/login', {
    method: 'POST',
    body: { login: email, password },
    auth: false,
  });
  await saveTokens({ access: pair.access_token, refresh: pair.refresh_token });
}

export async function logout(refreshToken: string): Promise<void> {
  await request('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken }, auth: 'optional' });
}

export const getMe = () => request<Record<string, unknown>>('/me');

// --- Фото и заявки ----------------------------------------------------------
/** Шаг 1: проверка фото. Возвращает photo_id для шага 2. */
export async function analyzePhoto(uri: string): Promise<AnalyzeResult> {
  const form = new FormData();
  const filename = uri.split('/').pop() || 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  try {
    // В Expo SDK 52+ для FormData нужен настоящий Blob, получаем его из uri снимка
    const res = await fetch(uri);
    const blob = await res.blob();
    form.append('image', blob, filename);
  } catch {
    // Резервный вариант для старых сред React Native
    form.append('image', { uri, name: filename, type } as any);
  }

  return request<AnalyzeResult>('/photos/analyze', { method: 'POST', form, timeoutMs: ANALYZE_TIMEOUT_MS });
}

/** Шаг 2: подача заявки. Повтор с тем же client_request_id вернёт ту же заявку. */
export async function createRequest(body: CreateRequestBody): Promise<Report> {
  return toReport(await request<Record<string, unknown>>('/requests', { method: 'POST', body }));
}

export async function listMyRequests(limit = 20, offset = 0): Promise<Page<Report>> {
  const page = await request<Page<Record<string, unknown>>>('/me/requests', { query: { limit, offset } });
  return { ...page, items: page.items.map(toReport) };
}

export async function getMyRequest(id: number): Promise<Report> {
  return toReport(await request<Record<string, unknown>>(`/me/requests/${id}`));
}

/** Все свои заявки (для карты), постранично. */
export async function listAllMyRequests(pageSize = 50, maxPages = 20): Promise<Report[]> {
  const all: Report[] = [];
  for (let i = 0; i < maxPages; i++) {
    const page = await listMyRequests(pageSize, all.length);
    all.push(...page.items);
    if (page.items.length === 0 || all.length >= page.total) break;
  }
  return all;
}
