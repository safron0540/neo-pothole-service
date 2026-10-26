import type {
  ContractorIn,
  ContractorOut,
  ContractorRequestOut,
  ContractorUpdate,
  RequestSummary,
  DefectClass,
  DispatcherRequestOut,
  DispatcherRequestSummary,
  DistrictOut,
  MapPoint,
  MapQuery,
  MeOut,
  Page,
  EventOut,
  NoteOut,
  RequestsQuery,
  Role,
  StatusChange,
  StreetIn,
  StreetUpdate,
  StreetGroupCode,
  StreetGroupOut,
  StreetOut,
  TokenPair,
  UserCreate,
  UserOut,
  UserUpdate,
} from './types';

import { ApiError, AUTH_EXPIRED_EVENT, KEYS, session } from './core';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4010/api/v1';

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string; details?: unknown };
  return new ApiError(
    body.message || `Ошибка сервера: ${response.status}`,
    response.status,
    body.code,
    body.details ?? null
  );
}

// ---------- Запросы ----------
type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

// Пустые значения пропускаем, массивы разворачиваем в повторяющийся параметр (status=a&status=b)
function qs(params?: object): string {
  const query = new URLSearchParams();
  Object.entries((params ?? {}) as Record<string, QueryValue>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((v) => query.append(key, String(v)));
    else query.set(key, String(value));
  });
  const s = query.toString();
  return s ? `?${s}` : '';
}

// Один параллельный refresh на всех: старый refresh_token после обмена недействителен
let refreshing: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  const refresh_token = session.refreshToken;
  if (!refresh_token) return Promise.resolve(false);

  refreshing = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token }),
      });
      if (!response.ok) return false;
      session.saveTokens((await response.json()) as TokenPair); // сохраняем ОБА токена
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function expireSession() {
  session.clear();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function send(path: string, init: RequestInit = {}, canRefresh = true): Promise<Response> {
  const headers = new Headers(init.headers);
  // Для FormData Content-Type выставит сам браузер (с boundary)
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = session.accessToken;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  // 401: один раз обновляем токен и повторяем запрос; не вышло — на страницу входа
  if (response.status === 401 && canRefresh && token) {
    if (await refreshTokens()) return send(path, init, false);
    expireSession();
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const enc = encodeURIComponent;

// ---------- API ----------
export const realApi = {
  // --- Авторизация ---
  staffLogin: async (login: string, password: string): Promise<{ role: Role; contractor_id: number | null }> => {
    const data = await request<TokenPair>('/auth/staff/login', json('POST', { login, password }));
    // Гражданин в веб-панель не пускаем: он работает через мобильное приложение
    if (data.role !== 'dispatcher' && data.role !== 'contractor') {
      throw new ApiError('Эта учётная запись не предназначена для веб-панели.', 403, 'forbidden');
    }
    session.saveTokens(data);
    localStorage.setItem(KEYS.role, data.role);
    if (data.contractor_id != null) localStorage.setItem(KEYS.contractor, String(data.contractor_id));
    return { role: data.role, contractor_id: data.contractor_id ?? null };
  },

  refresh: refreshTokens,

  logout: async () => {
    const refresh_token = session.refreshToken;
    try {
      if (refresh_token) await request<void>('/auth/logout', json('POST', { refresh_token }));
    } catch {
      /* выходим локально в любом случае */
    }
    session.clear();
  },

  me: () => request<MeOut>('/me'),

  // --- Заявки (диспетчер) ---
  getRequests: (params?: RequestsQuery) => request<Page<DispatcherRequestSummary>>(`/requests${qs(params)}`),

  getRequestById: (id: number) => request<DispatcherRequestOut>(`/requests/${id}`),

  getRequestEvents: (id: number) => request<EventOut[]>(`/requests/${id}/events`),

  // Класс и группа улицы — два отдельных запроса; оба возвращают полную карточку с новым version
  updateRequestClass: (id: number, defect_class: DefectClass, version: number) =>
    request<DispatcherRequestOut>(`/requests/${id}/class`, json('PATCH', { defect_class, version })),

  updateRequestStreetGroup: (id: number, street_group: StreetGroupCode, version: number) =>
    request<DispatcherRequestOut>(`/requests/${id}/street-group`, json('PATCH', { street_group, version })),

  setRequestContractor: (id: number, contractor_id: number, version: number) =>
    request<DispatcherRequestOut>(`/requests/${id}/contractor`, json('PUT', { contractor_id, version })),

  updateRequestStatus: (id: number, body: StatusChange) =>
    request<DispatcherRequestOut>(`/requests/${id}/status`, json('PATCH', body)),

  getRequestNotes: (id: number) => request<NoteOut[]>(`/requests/${id}/notes`),

  addRequestNote: (id: number, text: string) => request<NoteOut>(`/requests/${id}/notes`, json('POST', { text })),

  mergeRequest: (id: number, into_id: number, version: number) =>
    request<DispatcherRequestOut>(`/requests/${id}/merge`, json('POST', { into_id, version })),

  removeDuplicateFlag: (id: number, version: number) =>
    request<DispatcherRequestOut>(`/requests/${id}/duplicate-flag?version=${version}`, { method: 'DELETE' }),

  // --- Подрядчик ---
  getContractorRequests: (params?: { overdue?: boolean; limit?: number; offset?: number }) =>
    request<Page<RequestSummary>>(`/contractor/requests${qs(params)}`),

  getContractorRequestById: (id: number) => request<ContractorRequestOut>(`/contractor/requests/${id}`),

  // multipart, поле «image» (JPEG или PNG); version не нужен
  completeContractorRequest: (id: number, image: File) => {
    const formData = new FormData();
    formData.append('image', image);
    return request<ContractorRequestOut>(`/contractor/requests/${id}/complete`, { method: 'POST', body: formData });
  },

  // --- Карта ---
  getMapPoints: (params: MapQuery) => request<MapPoint[]>(`/map/points${qs(params)}`),

  // --- Справочники ---
  getDistricts: () => request<DistrictOut[]>('/districts'),
  createDistrict: (name: string) => request<DistrictOut>('/districts', json('POST', { name })),
  updateDistrict: (id: number, name: string) => request<DistrictOut>(`/districts/${id}`, json('PATCH', { name })),
  deleteDistrict: (id: number) => request<void>(`/districts/${id}`, { method: 'DELETE' }),

  getStreetGroups: () => request<StreetGroupOut[]>('/street-groups'),
  updateStreetGroup: (code: StreetGroupCode, deadline_hours: number, max_pits: number) =>
    request<StreetGroupOut>(`/street-groups/${enc(code)}`, json('PUT', { deadline_hours, max_pits })),

  getStreets: (params?: { q?: string; district_id?: number; street_group?: StreetGroupCode; limit?: number; offset?: number }) =>
    request<Page<StreetOut>>(`/streets${qs(params)}`),
  createStreet: (body: StreetIn) => request<StreetOut>('/streets', json('POST', body)),
  updateStreet: (id: number, body: StreetUpdate) => request<StreetOut>(`/streets/${id}`, json('PATCH', body)),
  deleteStreet: (id: number) => request<void>(`/streets/${id}`, { method: 'DELETE' }),

  getContractors: (params?: { is_active?: boolean }) => request<ContractorOut[]>(`/contractors${qs(params)}`),
  createContractor: (body: ContractorIn) => request<ContractorOut>('/contractors', json('POST', body)),
  updateContractor: (id: number, body: ContractorUpdate) =>
    request<ContractorOut>(`/contractors/${id}`, json('PATCH', body)),
  deleteContractor: (id: number) => request<void>(`/contractors/${id}`, { method: 'DELETE' }),

  // --- Пользователи ---
  getUsers: (params?: { role?: Role; is_active?: boolean; limit?: number; offset?: number }) =>
    request<Page<UserOut>>(`/users${qs(params)}`),
  createUser: (body: UserCreate) => request<UserOut>('/users', json('POST', body)),
  updateUser: (id: number, body: UserUpdate) =>
    request<UserOut>(`/users/${id}`, json('PATCH', body)),
  resetUserPassword: (id: number, password: string) =>
    request<void>(`/users/${id}/reset-password`, json('POST', { password })),
};

export type RealApi = typeof realApi;
