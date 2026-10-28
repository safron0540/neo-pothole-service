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
  await request('/auth/citizen/register', { method: 'POST', body, auth: false });
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
function fileParts(uri: string) {
  const ext = (uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  const png = ext === 'png';
  return { name: `photo.${png ? 'png' : 'jpg'}`, type: png ? 'image/png' : 'image/jpeg' };
}

/** Шаг 1: проверка фото. Возвращает photo_id для шага 2. */
export function analyzePhoto(uri: string): Promise<AnalyzeResult> {
  const form = new FormData();
  // В React Native файл в FormData передаётся объектом {uri, name, type}.
  form.append('image', { uri, ...fileParts(uri) } as unknown as Blob);
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
