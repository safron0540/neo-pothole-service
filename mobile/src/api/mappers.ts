import type { Report, StatusEvent } from '../types';
import type { StatusCode } from './types';

// ВНИМАНИЕ: в docs/mobile-api.md перечислены не все поля карточки заявки. Имена ниже
// взяты из описания (status {code,label}, photo_before_url, photo_after_url,
// citizen_comment, история событий); остальное читается с запасными вариантами.
// После получения docs/openapi.json сверить и упростить.
type Raw = Record<string, any>;

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function toEvent(e: Raw): StatusEvent {
  return {
    at: str(e.at) ?? str(e.created_at) ?? '',
    text: str(e.text) ?? str(e.message) ?? str(e.comment) ?? str(e.status?.label) ?? '',
  };
}

export function toReport(raw: Raw): Report {
  const status = raw.status ?? {};
  const loc = raw.location ?? {};
  const history = Array.isArray(raw.history) ? raw.history : Array.isArray(raw.events) ? raw.events : [];
  return {
    id: Number(raw.id ?? raw.number),
    address: str(raw.address) ?? '',
    status: {
      code: (str(status.code) ?? 'on_review') as StatusCode,
      label: str(status.label) ?? '',
    },
    createdAt: str(raw.created_at) ?? '',
    defectClass: str(raw.defect_class) ?? str(raw.class) ?? str(raw.manual_class) ?? null,
    lat: num(loc.lat ?? raw.lat),
    lng: num(loc.lon ?? loc.lng ?? raw.lon ?? raw.lng),
    comment: str(raw.citizen_comment),
    history: history.map(toEvent),
    photoBeforeUrl: str(raw.photo_before_url),
    photoAfterUrl: str(raw.photo_after_url),
  };
}
