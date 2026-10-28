import { IS_DEMO } from '../api';

// Откуда берутся тайлы карты (один адрес для всех карт):
//  • стенд / production — наш сервер: /tiles/{z}/{x}/{y}.png (публичные серверы OSM для коммерческого проекта запрещены);
//  • локальная разработка в демо-режиме (нет бэкенда) — обычные тайлы OpenStreetMap (допустимо для разработки на localhost);
//  • любой другой адрес — переменная VITE_MAP_TILE_URL (например, в .env.local).
// Тайлы CARTO без API-ключа больше не работают.
const OSM_STANDARD = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MAP_TILE_URL: string =
  (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || (IS_DEMO ? OSM_STANDARD : '/tiles/{z}/{x}/{y}.png');

// Подпись об авторстве данных обязательна по лицензии OpenStreetMap (ODbL). Текст можно заменить через
// VITE_MAP_ATTRIBUTION, если на стенде используется другой источник.
export const MAP_ATTRIBUTION: string =
  (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) || '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
