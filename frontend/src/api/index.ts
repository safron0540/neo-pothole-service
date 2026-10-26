// Единая точка входа в API. Страницы импортируют только отсюда.
//
//  • Демо-режим (по умолчанию в `npm run dev`, если не задан VITE_API_BASE_URL):
//    данные в памяти браузера, в формате контракта API v1 — бэкенд не нужен.
//  • Реальный режим: задайте VITE_API_BASE_URL (например http://localhost:8000/api/v1
//    для бэкенда или http://127.0.0.1:4010/api/v1 для мока Prism).
//  • VITE_DEMO=true принудительно включает демо-режим (в том числе в production-сборке).
import { realApi } from './real';
import type { RealApi } from './real';
import { createDemoApi } from './demo';

export { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demo';

export type * from './types';
export { ApiError, session, AUTH_EXPIRED_EVENT } from './core';

export const IS_DEMO: boolean = Boolean(
  import.meta.env.VITE_DEMO === 'true' || (import.meta.env.DEV && !import.meta.env.VITE_API_BASE_URL)
);

export const api: RealApi = IS_DEMO ? createDemoApi() : realApi;
