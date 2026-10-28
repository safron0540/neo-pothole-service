import * as SecureStore from 'expo-secure-store';

// Токены лежат в защищённом хранилище (Keystore на Android) и дублируются в памяти.
const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

export interface Tokens {
  access: string;
  refresh: string;
}

let cache: Tokens | null = null;
let loaded = false;

export async function loadTokens(): Promise<Tokens | null> {
  if (loaded) return cache;
  try {
    const [access, refresh] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
    ]);
    cache = access && refresh ? { access, refresh } : null;
  } catch {
    cache = null;
  }
  loaded = true;
  return cache;
}

export const getTokens = () => cache;

export async function saveTokens(t: Tokens): Promise<void> {
  cache = t;
  loaded = true;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, t.access),
    SecureStore.setItemAsync(REFRESH_KEY, t.refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  cache = null;
  loaded = true;
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  } catch {
    // уже очищено в памяти; повторим при следующем входе
  }
}
