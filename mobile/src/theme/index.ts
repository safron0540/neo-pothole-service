import type { ReportStatus } from '../types';

// Токены темы (УД-3). Значения сняты с макетов Figma; уточнить у дизайнера.
export const colors = {
  primary: '#C8281A',
  text: '#1B1B1B',
  textMuted: '#7A7A7A',
  bg: '#FFFFFF',
  surface: '#DEDEDE',
  surfaceSoft: '#F2F2F2',
  border: '#B8B8B8',
  disabled: '#A3A3A3',
  white: '#FFFFFF',
  black: '#000000',
};

// Цветовая кодировка статусов (УД-2) — единственное место, где она задана.
export const statusColors: Record<ReportStatus, string> = {
  'На проверке': '#9E9E9E',
  'Принято': '#2F6FDE',
  'В работе': '#F2B705',
  'Выполнено': '#2E9E4F',
  'Отклонено': '#D93025',
  'Требует уточнения': '#F57C00',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const fontSize = { xs: 11, sm: 13, md: 15, lg: 17, xl: 22 };
