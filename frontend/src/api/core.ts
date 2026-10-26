import type { Role, TokenPair } from './types';

// Событие, по которому App возвращает пользователя на страницу входа
export const AUTH_EXPIRED_EVENT = 'auth:expired';

// Контракт ошибок: { code, message (по-русски), details }
export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(message: string, status: number, code = 'unknown', details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---------- Хранилище сессии ----------
export const KEYS = {
  access: 'access_token',
  refresh: 'refresh_token',
  role: 'user_role',
  contractor: 'contractor_id',
} as const;

export const session = {
  get accessToken() {
    return localStorage.getItem(KEYS.access);
  },
  get refreshToken() {
    return localStorage.getItem(KEYS.refresh);
  },
  get role(): Role | null {
    const r = localStorage.getItem(KEYS.role);
    return r === 'dispatcher' || r === 'contractor' ? r : null;
  },
  saveTokens(pair: Pick<TokenPair, 'access_token' | 'refresh_token'>) {
    localStorage.setItem(KEYS.access, pair.access_token);
    localStorage.setItem(KEYS.refresh, pair.refresh_token);
  },
  clear() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};
