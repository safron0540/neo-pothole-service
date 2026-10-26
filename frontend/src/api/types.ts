// Типы контракта API v1 — по docs/openapi.json (схемы с теми же именами, где это возможно).
// Написаны вручную и сверены с контрактом по полям, обязательности и допустимым значениям.
// Для автогенерации можно использовать:  npm run gen:types  (создаст src/api/schema.d.ts).

export type StatusCode =
  | 'on_review'
  | 'accepted'
  | 'rejected'
  | 'needs_clarification'
  | 'in_progress'
  | 'done';

export type DefectClass = 'big' | 'small';
export type StreetGroupCode = 'А' | 'Б' | 'В' | 'Г' | 'Д' | 'Е';
export type RejectReason = 'small_pit' | 'not_a_pit' | 'duplicate' | 'other';
export type ClassSource = 'model' | 'citizen' | 'dispatcher';

// Роли, которым доступна веб-панель. Гражданин (citizen) работает только через мобильное приложение
export type Role = 'dispatcher' | 'contractor';
export type AnyRole = Role | 'citizen';

export type EventType =
  | 'created'
  | 'processed'
  | 'status_changed'
  | 'class_changed'
  | 'group_changed'
  | 'contractor_changed'
  | 'merged'
  | 'duplicate_flag_removed'
  | 'note_added';

export interface StatusOut {
  code: StatusCode;
  label: string;
}

export interface Ref {
  id: number;
  name: string;
}

export interface Point {
  lat: number;
  lon: number;
}

export interface Applicant {
  first_name: string;
  last_name: string;
  phone: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface GeoMultiPolygon {
  type: string; // "MultiPolygon"
  coordinates: unknown[][][][]; // [долгота, широта]
}

export interface GeoLineString {
  type: string; // "LineString"
  coordinates: unknown[][];
}

// ---------- Ошибки ----------
export interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

// ---------- Авторизация ----------
export interface LoginRequest {
  login: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  role: AnyRole;
  contractor_id?: number | null;
}

export interface MeOut {
  id: number;
  login: string;
  first_name: string;
  last_name: string;
  role: AnyRole;
  phone?: string | null;
  contractor_id?: number | null;
}

// ---------- Заявки (диспетчер) ----------
export interface DispatcherRequestSummary {
  id: number;
  status: StatusOut;
  defect_class: DefectClass;
  address: string | null;
  detected_at: string;
  planned_due_at: string | null;
  is_overdue: boolean;
  street_group: StreetGroupCode | null;
  district: Ref | null;
  contractor: Ref | null;
  duplicates_count: number;
  duplicate_of_id: number | null;
  needs_group: boolean;
  needs_contractor: boolean;
  version: number;
}

export interface DispatcherRequestOut extends DispatcherRequestSummary {
  location: Point;
  accuracy_m: number | null;
  house_number: string | null;
  street_id: number | null;
  model_class: DefectClass | null;
  class_source: ClassSource;
  pits_count: number;
  must_fix: boolean;
  recommendation: StatusOut;
  reject_reason: RejectReason | null;
  decision_comment: string | null;
  citizen_comment: string | null;
  merged_into_id: number | null;
  completed_at: string | null;
  photo_before_url: string;
  photo_after_url: string | null;
  // Только в статусе «Требует уточнения», в остальных null (решение В-27)
  applicant: Applicant | null;
}

export interface EventOut {
  id: number;
  type: EventType;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface NoteOut {
  id: number;
  author: Ref;
  text: string;
  created_at: string;
}

export interface NoteCreate {
  text: string;
}

export interface RequestsQuery {
  status?: StatusCode[];
  district_id?: number;
  street_group?: StreetGroupCode;
  defect_class?: DefectClass;
  contractor_id?: number;
  needs_group?: boolean;
  needs_contractor?: boolean;
  duplicate?: boolean;
  overdue?: boolean;
  detected_from?: string;
  detected_to?: string;
  sort?: 'priority' | 'detected_at';
  limit?: number; // 1..200, по умолчанию 50
  offset?: number;
}

export interface StatusChange {
  to: StatusCode;
  version: number;
  comment?: string | null;
  reject_reason?: RejectReason | null;
}

export interface ClassChange {
  defect_class: DefectClass;
  version: number;
}

export interface StreetGroupChange {
  street_group: StreetGroupCode;
  version: number;
}

export interface ContractorAssign {
  contractor_id: number;
  version: number;
}

export interface MergeRequest {
  into_id: number;
  version: number;
}

// ---------- Карта ----------
export interface MapPoint {
  id: number;
  lat: number;
  lon: number;
  status: StatusCode; // на карте только код, без подписи
  defect_class: DefectClass;
  is_overdue: boolean;
  address: string | null;
  street_group: StreetGroupCode | null;
  district: Ref | null;
  contractor: Ref | null;
  detected_at: string;
  planned_due_at: string | null;
}

export interface MapQuery {
  bbox: string; // запад,юг,восток,север (Leaflet: map.getBounds().toBBoxString())
  status?: StatusCode[];
  defect_class?: DefectClass;
  district_id?: number;
  street_group?: StreetGroupCode;
  contractor_id?: number;
  detected_from?: string;
  detected_to?: string;
}

// ---------- Подрядчик ----------
export interface RequestSummary {
  id: number;
  status: StatusOut;
  defect_class: DefectClass;
  address: string | null;
  detected_at: string;
  planned_due_at: string | null;
  is_overdue: boolean;
}

export interface ContractorRequestOut extends RequestSummary {
  location: Point;
  house_number: string | null;
  street_group: StreetGroupCode | null;
  photo_before_url: string;
  photo_after_url: string | null;
  completed_at: string | null;
  version: number;
}

// ---------- Справочники ----------
export interface DistrictIn {
  name: string;
}

export interface DistrictOut {
  id: number;
  name: string;
}

export interface StreetGroupOut {
  code: StreetGroupCode;
  deadline_hours: number;
  max_pits: number;
}

export interface StreetGroupUpdate {
  deadline_hours: number;
  max_pits: number;
}

export interface StreetOut {
  id: number;
  name: string;
  street_group: StreetGroupCode | null;
  district_id: number;
  osm_id: number | null;
  geometry: GeoLineString;
}

export interface StreetIn {
  name: string;
  street_group: StreetGroupCode | null;
  district_id: number;
  geometry: GeoLineString;
}

export interface StreetUpdate {
  name?: string | null;
  street_group?: StreetGroupCode | null;
  district_id?: number | null;
}

export interface ContractorOut {
  id: number;
  name: string;
  phone: string;
  email: string;
  zone: GeoMultiPolygon | null;
  is_active: boolean;
}

export interface ContractorIn {
  name: string;
  phone: string;
  email: string;
  zone?: GeoMultiPolygon | null;
}

export interface ContractorUpdate {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  zone?: GeoMultiPolygon | null;
  is_active?: boolean | null;
}

// ---------- Пользователи ----------
export interface UserOut {
  id: number;
  login: string;
  first_name: string;
  last_name: string;
  role: AnyRole;
  is_active: boolean;
  contractor_id: number | null;
}

export interface UserCreate {
  login: string;
  first_name: string;
  last_name: string;
  role: AnyRole;
  password: string;
  contractor_id?: number | null;
}

export interface UserUpdate {
  first_name?: string | null;
  last_name?: string | null;
  is_active?: boolean | null;
  contractor_id?: number | null;
}

export interface PasswordReset {
  password: string;
}
