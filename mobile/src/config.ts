import { NativeModules } from 'react-native';

// Адрес API выбирается так:
// 1) EXPO_PUBLIC_API_URL из .env, если задан (стенд или явный IP);
// 2) в разработке — IP компьютера, с которого запущен `expo start`, порт 8080;
// 3) запасной вариант — стенд, доступный и с телефона, и из production-сборки.
const API_PORT = 8080;
const API_PATH = '/api/v1';
const DEFAULT_API_URL = 'https://pothole.safronspace.ru/api/v1';

function devServerHost(): string | null {
  const scriptUrl: string | undefined = NativeModules?.SourceCode?.scriptURL;
  const m = scriptUrl ? /^https?:\/\/([^:/]+)/.exec(scriptUrl) : null;
  return m ? m[1] : null;
}

function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const host = __DEV__ ? devServerHost() : null;
  return host ? `http://${host}:${API_PORT}${API_PATH}` : DEFAULT_API_URL;
}

export const API_URL = resolveApiUrl();
export const TILE_BASE_URL = API_URL.replace(/\/api\/v1\/?$/, '');
export const TILE_URL = `${TILE_BASE_URL}/tiles/{z}/{x}/{y}.png`;

export const REQUEST_TIMEOUT_MS = 15_000;
// ML на сервере отвечает до 8 с, поэтому для проверки фото таймаут больше.
export const ANALYZE_TIMEOUT_MS = 30_000;
