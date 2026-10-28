import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Токены лежат в защищённом хранилище (Keystore на Android, localStorage в web) и дублируются в памяти.
const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

export interface Tokens {
  access: string;
  refresh: string;
}

let cache: Tokens | null = null;
let loaded = false;

async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function storageDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function loadTokens(): Promise<Tokens | null> {
  if (loaded) return cache;
  try {
    const [access, refresh] = await Promise.all([
      storageGet(ACCESS_KEY),
      storageGet(REFRESH_KEY),
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
    storageSet(ACCESS_KEY, t.access),
    storageSet(REFRESH_KEY, t.refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  cache = null;
  loaded = true;
  try {
    await Promise.all([
      storageDelete(ACCESS_KEY),
      storageDelete(REFRESH_KEY),
    ]);
  } catch {
    // уже очищено в памяти; повторим при следующем входе
  }
}
