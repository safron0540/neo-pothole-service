// Только оформление и подписи, которых нет в API. Сами справочники (районы, группы улиц,
// подрядчики) приходят с бэкенда — см. useReference.ts.
import type { DefectClass, RejectReason, StatusCode, StreetGroupCode } from '../api/types';

export type { DefectClass, RejectReason, StatusCode, StreetGroupCode };

// Порядок — как на карте и в фильтрах
export const STATUS_CODES: StatusCode[] = [
  'on_review',
  'accepted',
  'in_progress',
  'done',
  'needs_clarification',
  'rejected',
];

// В маркерах карты статус приходит только кодом, поэтому подписи держим здесь.
// В остальных ответах API бери status.label.
export const STATUS_LABEL: Record<StatusCode, string> = {
  on_review: 'На проверке',
  accepted: 'Принято',
  rejected: 'Отклонено',
  needs_clarification: 'Требует уточнения',
  in_progress: 'В работе',
  done: 'Выполнено',
};

export const STATUS_COLOR: Record<StatusCode, string> = {
  on_review: '#9E9E9E',
  accepted: '#2D6CDF',
  in_progress: '#F2B705',
  done: '#2E9E4F',
  needs_clarification: '#F08A24',
  rejected: '#D93025',
};

export const DEFECT_CLASS_LABEL: Record<DefectClass, string> = {
  big: 'Большая',
  small: 'Маленькая',
};

export const REJECT_REASON_LABEL: Record<RejectReason, string> = {
  small_pit: 'Маленькая яма (уйдёт в плановый ремонт)',
  not_a_pit: 'Не яма',
  duplicate: 'Дубликат',
  other: 'Другое',
};

// Цвет зоны подрядчика на карте — оформление, бэкенд его не хранит
const ZONE_COLORS = ['#2D6CDF', '#2E9E4F', '#F08A24', '#C42915', '#616161', '#F2B705'];
export const contractorColor = (id: number) => ZONE_COLORS[Math.abs(id) % ZONE_COLORS.length];

export const statusLabel = (code: string): string => STATUS_LABEL[code as StatusCode] ?? code;
