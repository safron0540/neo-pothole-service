// Демо-режим: «бэкенд» в памяти браузера. Отвечает в формате контракта API v1,
// поэтому страницы работают так же, как с настоящим сервером. Данные живут до перезагрузки страницы.
import { ApiError, KEYS, session } from './core';
import type { RealApi } from './real';
import type {
  Applicant,
  ContractorOut,
  ContractorRequestOut,
  DefectClass,
  DispatcherRequestOut,
  DispatcherRequestSummary,
  DistrictOut,
  EventOut,
  EventType,
  GeoLineString,
  GeoMultiPolygon,
  MapPoint,
  NoteOut,
  Page,
  RequestSummary,
  RequestsQuery,
  Role,
  StatusCode,
  StatusOut,
  StreetGroupCode,
  StreetGroupOut,
  StreetOut,
  UserOut,
  PlannedRepairStatus,
} from './types';
import { STATUS_LABEL } from '../data/reference';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ACCOUNTS: { login: string; role: Role; label: string; name: string }[] = [
  { login: 'dispatcher', role: 'dispatcher', label: 'Диспетчер', name: 'Иванова Е. А.' },
  { login: 'contractor1', role: 'contractor', label: 'Подрядчик', name: 'Воронов А. С.' },
];

const DEMO_USER_KEY = 'demo_user_id';
const HOUR = 36e5;
const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * HOUR).toISOString();
const sleep = (ms = 140) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const status = (code: StatusCode): StatusOut => ({ code, label: STATUS_LABEL[code] });
const conflict = (message: string) => new ApiError(message, 409, 'conflict');
const notFound = () => new ApiError('Не найдено.', 404, 'not_found');
const invalid = (message: string) => new ApiError(message, 422, 'validation_error');

// Заглушка вместо фотографии (SVG data-URI, без сети)
function photo(label: string, tone: 'before' | 'after'): string {
  const bg = tone === 'before' ? '#616161' : '#2E9E4F';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="${bg}"/><ellipse cx="320" cy="250" rx="${tone === 'before' ? 150 : 90}" ry="${tone === 'before' ? 52 : 28}" fill="${tone === 'before' ? '#212121' : '#9E9E9E'}"/><text x="320" y="80" font-family="sans-serif" font-size="26" fill="#fff" text-anchor="middle">${tone === 'before' ? 'Фото до ремонта' : 'Фото после ремонта'}</text><text x="320" y="118" font-family="sans-serif" font-size="20" fill="#E0E0E0" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------- Справочники
let districts: DistrictOut[] = [
  { id: 1, name: 'Кировский район' },
  { id: 2, name: 'Ленинский район' },
  { id: 3, name: 'Октябрьский район' },
  { id: 4, name: 'Советский район' },
];

let streetGroups: StreetGroupOut[] = [
  { code: 'А', deadline_hours: 24, max_pits: 3 },
  { code: 'Б', deadline_hours: 48, max_pits: 3 },
  { code: 'В', deadline_hours: 72, max_pits: 3 },
  { code: 'Г', deadline_hours: 96, max_pits: 3 },
  { code: 'Д', deadline_hours: 120, max_pits: 3 },
  { code: 'Е', deadline_hours: 168, max_pits: 3 },
];

const rect = (lat1: number, lon1: number, lat2: number, lon2: number): GeoMultiPolygon => ({
  type: 'MultiPolygon',
  // GeoJSON: [долгота, широта], контур замкнут
  coordinates: [[[[lon1, lat1], [lon1, lat2], [lon2, lat2], [lon2, lat1], [lon1, lat1]]]],
});

let contractors: ContractorOut[] = [
  { id: 1, name: 'ООО «ДорСтрой-Лидер»', phone: '+7 (903) 124-55-88', email: 'info@dorstroy-lider.ru', zone: rect(56.455, 84.94, 56.47, 84.97), is_active: true },
  { id: 2, name: 'МУП «Автодор-Север»', phone: '+7 (985) 674-12-90', email: 'office@avtodor-sever.ru', zone: rect(56.48, 84.96, 56.505, 85.0), is_active: true },
  { id: 3, name: 'ООО «Магистраль-Юг»', phone: '+7 (916) 120-09-33', email: 'mail@magistral-yug.ru', zone: rect(56.43, 84.93, 56.452, 84.98), is_active: true },
];

const line = (...pts: [number, number][]): GeoLineString => ({ type: 'LineString', coordinates: pts.map(([lat, lon]) => [lon, lat]) });

let streets: StreetOut[] = [
  { id: 1, name: 'ул. Ленина', street_group: 'А', district_id: 2, osm_id: null, geometry: line([56.46, 84.95], [56.47, 84.96]) },
  { id: 2, name: 'просп. Мира', street_group: 'В', district_id: 3, osm_id: null, geometry: line([56.44, 84.95], [56.445, 84.96]) },
  { id: 3, name: 'ул. Смольная', street_group: 'Б', district_id: 4, osm_id: null, geometry: line([56.49, 84.97], [56.5, 84.98]) },
  { id: 4, name: 'ул. Божова', street_group: 'А', district_id: 4, osm_id: null, geometry: line([56.48, 84.96], [56.485, 84.965]) },
  { id: 5, name: 'ул. Витимская', street_group: 'А', district_id: 2, osm_id: null, geometry: line([56.45, 84.94], [56.455, 84.945]) },
  { id: 6, name: 'ул. Демьяна Белого', street_group: 'Б', district_id: 2, osm_id: null, geometry: line([56.462, 84.955], [56.466, 84.96]) },
  { id: 7, name: 'ул. Весенняя', street_group: 'Б', district_id: 1, osm_id: null, geometry: line([56.463, 84.96], [56.466, 84.965]) },
  { id: 8, name: 'ул. Кулагина', street_group: 'В', district_id: 4, osm_id: null, geometry: line([56.5, 84.99], [56.504, 84.995]) },
  { id: 9, name: 'пер. Богашевский', street_group: 'В', district_id: 4, osm_id: null, geometry: line([56.497, 84.985], [56.499, 84.988]) },
  { id: 10, name: 'ул. Лесная', street_group: 'Г', district_id: 1, osm_id: null, geometry: line([56.465, 84.93], [56.468, 84.935]) },
  { id: 11, name: 'ул. Садовая', street_group: 'Д', district_id: 3, osm_id: null, geometry: line([56.435, 84.96], [56.438, 84.965]) },
];

let users: UserOut[] = [
  { id: 1, login: 'dispatcher', first_name: 'Елена', last_name: 'Иванова', role: 'dispatcher', is_active: true, contractor_id: null },
  { id: 2, login: 's.petrov', first_name: 'Сергей', last_name: 'Петров', role: 'dispatcher', is_active: true, contractor_id: null },
  { id: 3, login: 'contractor1', first_name: 'Алексей', last_name: 'Воронов', role: 'contractor', is_active: true, contractor_id: 1 },
  { id: 4, login: 'v.sokolov', first_name: 'Виктор', last_name: 'Соколов', role: 'contractor', is_active: true, contractor_id: 1 },
  { id: 5, login: 'a.smirnov', first_name: 'Андрей', last_name: 'Смирнов', role: 'contractor', is_active: true, contractor_id: 2 },
];
const passwords = new Map<number, string>(users.map((u) => [u.id, DEMO_PASSWORD]));

// ---------------------------------------------------------------- Заявки
interface Rec {
  id: number;
  version: number;
  status: StatusCode;
  defect_class: DefectClass;
  address: string;
  house_number: string | null;
  street_group: StreetGroupCode | null;
  district_id: number | null;
  contractor_id: number | null;
  detected_at: string;
  lat: number;
  lon: number;
  applicant: Applicant;
  duplicates_count: number;
  duplicate_of_id: number | null;
  merged_into_id: number | null;
  reject_reason: DispatcherRequestOut['reject_reason'];
  decision_comment: string | null;
  completed_at: string | null;
  photo_after: boolean;
}

const person = (last: string, first: string, phone: string): Applicant => ({ last_name: last, first_name: first, phone });

const seed = (
  id: number,
  address: string,
  cls: DefectClass,
  st: StatusCode,
  group: StreetGroupCode | null,
  district: number | null,
  contractor: number | null,
  agoH: number,
  lat: number,
  lon: number,
  applicant: Applicant,
  extra: Partial<Rec> = {}
): Rec => ({
  id,
  version: st === 'on_review' ? 1 : 2,
  status: st,
  defect_class: cls,
  address,
  house_number: address.match(/,\s*(\d+\S*)$/)?.[1] ?? null,
  street_group: group,
  district_id: district,
  contractor_id: contractor,
  detected_at: hoursAgo(agoH),
  lat,
  lon,
  applicant,
  duplicates_count: 0,
  duplicate_of_id: null,
  merged_into_id: null,
  reject_reason: null,
  decision_comment: null,
  completed_at: null,
  photo_after: false,
  ...extra,
});

let requests: Rec[] = [
  seed(20092026, 'ул. Ленина, 15', 'big', 'on_review', 'А', 2, 1, 5, 56.467, 84.952, person('Иванов', 'Алексей', '+7 913 123-45-67'), { duplicates_count: 1 }),
  seed(200292027, 'ул. Смольная, 19', 'big', 'on_review', 'Б', 4, 2, 7, 56.495, 84.975, person('Петров', 'Василий', '+7 999 123-45-67')),
  seed(200292028, 'просп. Мира, 102', 'big', 'on_review', 'В', 3, 3, 25, 56.442, 84.955, person('Сидоров', 'Сергей', '+7 905 000-11-22')),
  seed(200292029, 'ул. Учебная, 8', 'small', 'on_review', 'А', 2, 1, 4, 56.459, 84.948, person('Кузнецов', 'Дмитрий', '+7 913 222-33-44')),
  seed(200292035, 'ул. Лесная, 12', 'big', 'on_review', 'Г', 1, null, 3, 56.467, 84.932, person('Смирнова', 'Ольга', '+7 923 400-10-10')),
  seed(200292036, 'ул. Садовая, 7', 'small', 'on_review', 'Д', 3, 3, 9, 56.437, 84.962, person('Федоров', 'Игорь', '+7 952 300-20-20')),
  seed(200292037, 'ул. Красноармейская, 120', 'big', 'on_review', null, null, null, 2, 56.478, 84.971, person('Мельникова', 'Анна', '+7 960 111-22-33')),
  seed(200292038, 'ул. Ленина, 15', 'big', 'on_review', 'А', 2, 1, 1, 56.4671, 84.9521, person('Новиков', 'Павел', '+7 913 700-80-90'), { duplicate_of_id: 20092026 }),
  seed(200292030, 'ул. 79 Гвардейской дивизии, 14', 'big', 'in_progress', 'А', 4, 2, 30, 56.488, 84.968, person('Орлова', 'Мария', '+7 923 555-10-20')),
  seed(200292031, 'ул. Красноармейская, 67', 'small', 'accepted', 'Б', 1, 1, 20, 56.462, 84.96, person('Белов', 'Пётр', '+7 952 700-30-40')),
  seed(200292032, 'пр. Фрунзе, 96', 'big', 'done', 'А', 2, 1, 240, 56.448, 84.94, person('Тихонов', 'Евгений', '+7 913 808-09-10'), {
    completed_at: hoursAgo(220),
    photo_after: true,
  }),
  seed(200292033, 'ул. Нахимова, 13', 'small', 'rejected', 'В', 3, null, 100, 56.436, 84.965, person('Громов', 'Илья', '+7 961 111-22-33'), {
    reject_reason: 'small_pit',
    decision_comment: 'Маленькая яма, включена в плановый ремонт.',
  }),
  seed(200292034, 'ул. Лебедева, 39', 'small', 'needs_clarification', 'Б', 4, 2, 15, 56.5, 84.99, person('Фомина', 'Анастасия', '+7 960 444-55-66')),
  seed(200292040, 'ул. Вершинина, 24', 'big', 'in_progress', 'А', 2, 1, 50, 56.4655, 84.9425, person('Давыдов', 'Роман', '+7 913 900-10-10')),
  seed(200292041, 'Иркутский тракт, 19', 'big', 'in_progress', 'Б', 1, 1, 40, 56.461, 84.947, person('Лукина', 'Вера', '+7 913 600-70-80')),
];

const events: Record<number, EventOut[]> = {};
let nextEventId = 1;
const notes: Record<number, NoteOut[]> = {};
let nextNoteId = 1;

function pushEvent(requestId: number, type: EventType, actor: string, payload: Record<string, unknown> = {}, at = new Date().toISOString()) {
  (events[requestId] ??= []).push({ id: nextEventId++, type, actor, payload, created_at: at });
}

for (const r of requests) {
  pushEvent(r.id, 'created', `${r.applicant.last_name} ${r.applicant.first_name}`, {}, r.detected_at);
  pushEvent(r.id, 'processed', 'Система', {}, r.detected_at);
  if (r.status !== 'on_review') {
    pushEvent(r.id, 'status_changed', 'Иванова Е. А.', { from: 'on_review', to: r.status }, hoursAgo(Math.max(0, (NOW - Date.parse(r.detected_at)) / HOUR - 2)));
  }
}

const groupOf = (code: StreetGroupCode | null) => streetGroups.find((g) => g.code === code);
const dueAt = (r: Rec): string | null => {
  const g = groupOf(r.street_group);
  return g ? new Date(Date.parse(r.detected_at) + g.deadline_hours * HOUR).toISOString() : null;
};
const isOverdue = (r: Rec) => {
  const due = dueAt(r);
  return !!due && Date.parse(due) < Date.now() && r.status !== 'done' && r.status !== 'rejected';
};
const refDistrict = (id: number | null) => {
  const d = districts.find((x) => x.id === id);
  return d ? { id: d.id, name: d.name } : null;
};
const refContractor = (id: number | null) => {
  const c = contractors.find((x) => x.id === id);
  return c ? { id: c.id, name: c.name } : null;
};

function toSummary(r: Rec): DispatcherRequestSummary {
  return {
    id: r.id,
    status: status(r.status),
    defect_class: r.defect_class,
    address: r.address,
    detected_at: r.detected_at,
    planned_due_at: dueAt(r),
    is_overdue: isOverdue(r),
    street_group: r.street_group,
    district: refDistrict(r.district_id),
    contractor: refContractor(r.contractor_id),
    duplicates_count: r.duplicates_count,
    duplicate_of_id: r.duplicate_of_id,
    needs_group: r.street_group === null,
    needs_contractor: r.contractor_id === null,
    version: r.version,
  };
}

function toOut(r: Rec): DispatcherRequestOut {
  return {
    ...toSummary(r),
    location: { lat: r.lat, lon: r.lon },
    accuracy_m: 6,
    house_number: r.house_number,
    street_id: null,
    model_class: r.defect_class,
    class_source: 'model',
    pits_count: r.defect_class === 'big' ? 2 : 1,
    must_fix: r.defect_class === 'big',
    recommendation: status(r.defect_class === 'big' ? 'accepted' : 'rejected'),
    reject_reason: r.reject_reason,
    decision_comment: r.decision_comment,
    citizen_comment: null,
    merged_into_id: r.merged_into_id,
    completed_at: r.completed_at,
    photo_before_url: photo(r.address, 'before'),
    photo_after_url: r.photo_after ? photo(r.address, 'after') : null,
    // В демо контакты показаны на всех статусах, как в макете. Настоящий API по решению В-27 отдаёт их только в «Требует уточнения»
    applicant: r.applicant,
  };
}

function toContractorOut(r: Rec): ContractorRequestOut {
  const district = refDistrict(r.district_id);
  return {
    id: r.id,
    status: status(r.status),
    defect_class: r.defect_class,
    // Контракт: address — «улица, дом, район»
    address: district ? `${r.address}, ${district.name}` : r.address,
    detected_at: r.detected_at,
    planned_due_at: dueAt(r),
    is_overdue: isOverdue(r),
    location: { lat: r.lat, lon: r.lon },
    house_number: r.house_number,
    street_group: r.street_group,
    photo_before_url: photo(r.address, 'before'),
    photo_after_url: r.photo_after ? photo(r.address, 'after') : null,
    completed_at: r.completed_at,
    version: r.version,
  };
}

const findRec = (id: number): Rec => {
  const r = requests.find((x) => x.id === id && x.merged_into_id === null);
  if (!r) throw notFound();
  return r;
};

function update(id: number, version: number, patch: Partial<Rec>): Rec {
  const r = findRec(id);
  if (r.version !== version) throw conflict('Заявку уже изменил другой пользователь. Обновите карточку.');
  const next = { ...r, ...patch, version: r.version + 1 };
  requests = requests.map((x) => (x.id === id ? next : x));
  return next;
}

const GROUP_ORDER: Record<string, number> = { А: 0, Б: 1, В: 2, Г: 3, Д: 4, Е: 5 };

function matches(r: Rec, q: RequestsQuery): boolean {
  if (r.merged_into_id !== null) return false;
  if (q.status?.length && !q.status.includes(r.status)) return false;
  if (q.district_id != null && r.district_id !== q.district_id) return false;
  if (q.street_group && r.street_group !== q.street_group) return false;
  if (q.defect_class && r.defect_class !== q.defect_class) return false;
  if (q.contractor_id != null && r.contractor_id !== q.contractor_id) return false;
  if (q.needs_group && r.street_group !== null) return false;
  if (q.needs_contractor && r.contractor_id !== null) return false;
  if (q.duplicate && !(r.duplicates_count > 0 || r.duplicate_of_id !== null)) return false;
  if (q.overdue && !isOverdue(r)) return false;
  if (q.detected_from && r.detected_at < q.detected_from) return false;
  if (q.detected_to && r.detected_at > q.detected_to) return false;
  return true;
}

function paginate<T>(items: T[], limit = 50, offset = 0): Page<T> {
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

// ---------------------------------------------------------------- Текущий пользователь
function currentUser(): UserOut {
  const id = Number(localStorage.getItem(DEMO_USER_KEY));
  const user = users.find((u) => u.id === id && u.is_active);
  if (!user) throw new ApiError('Требуется вход.', 401, 'unauthorized');
  return user;
}

const actorName = (u: UserOut) => `${u.last_name} ${u.first_name[0]}.`;
const ALLOWED_FROM: StatusCode[] = ['on_review', 'needs_clarification'];
const DECISIONS: StatusCode[] = ['accepted', 'rejected', 'needs_clarification'];

// Плановый ремонт в демо-режиме: настоящие куски улиц Томска по 100 м (из OSM),
// чтобы участок на карте лежал на дороге, а не где придётся
const DEMO_PLANNED_SEED: [string, string, StreetGroupCode, number, number, [number, number][]][] = [
  ['улица Вершинина', 'Кировский район', 'В', 12, 2.5, [[84.96255, 56.45894], [84.96253, 56.45804]]],
  ['проспект Ленина', 'Советский район', 'А', 5, 3.8, [[84.942, 56.51289], [84.94277, 56.51215]]],
  ['Красноармейская улица', 'Кировский район', 'Б', 4, 15, [[84.96626, 56.48322], [84.96641, 56.48413]]],
  ['Учебная улица', 'Кировский район', 'В', 13, 19, [[84.9394, 56.45891], [84.94102, 56.45893]]],
  ['улица Котовского', 'Кировский район', 'Г', 21, 26, [[84.96766, 56.46141], [84.96764, 56.46051]]],
  ['улица Фёдора Лыткина', 'Кировский район', 'Г', 19, 41, [[84.97183, 56.45122], [84.97185, 56.45212]]],
  ['Комсомольский проспект', 'Советский район', 'Б', 6, 47, [[84.98126, 56.49395], [84.98192, 56.49407], [84.98224, 56.49417]]],
  ['Богашёвский тракт', 'Кировский район', 'А', 4, 52, [[85.11257, 56.38322], [85.11272, 56.3846]]],
];
const DEMO_THRESHOLD: Record<StreetGroupCode, number> = { А: 2, Б: 2, В: 10, Г: 16, Д: 42, Е: 104 };
const DEMO_PLANNED = DEMO_PLANNED_SEED.map(([street, district, group, pits, hoursAgo, line], i) => {
  const mid = line[Math.floor(line.length / 2)];
  return {
    id: i + 1,
    street: { id: 100 + i, name: street },
    district: { id: 10 + i, name: district },
    street_group: group,
    segment_idx: 0,
    segment: { type: 'LineString' as const, coordinates: line },
    center: { lat: mid[1], lon: mid[0] },
    pits_count: pits,
    threshold: DEMO_THRESHOLD[group],
    status: 'open' as PlannedRepairStatus,
    decided_at: null as string | null,
    decision_comment: null as string | null,
    created_at: new Date(Date.now() - hoursAgo * 36e5).toISOString(),
    updated_at: new Date(Date.now() - hoursAgo * 36e5).toISOString(),
  };
});

export function createDemoApi(): RealApi {
  return {
    // ---- Авторизация ----
    staffLogin: async (login, password) => {
      await sleep();
      const user = users.find((u) => u.login === login);
      if (!user || !user.is_active || passwords.get(user.id) !== password) {
        throw new ApiError('Неверный логин или пароль.', 401, 'unauthorized');
      }
      if (user.role !== 'dispatcher' && user.role !== 'contractor') {
        throw new ApiError('Эта учётная запись не предназначена для веб-панели.', 403, 'forbidden');
      }
      session.saveTokens({ access_token: `demo-access-${user.id}`, refresh_token: `demo-refresh-${user.id}` });
      localStorage.setItem(KEYS.role, user.role);
      localStorage.setItem(DEMO_USER_KEY, String(user.id));
      return { role: user.role, contractor_id: user.contractor_id };
    },

    refresh: async () => true,

    logout: async () => {
      session.clear();
      localStorage.removeItem(DEMO_USER_KEY);
    },

    me: async () => {
      await sleep(60);
      const u = currentUser();
      return { id: u.id, login: u.login, first_name: u.first_name, last_name: u.last_name, role: u.role, contractor_id: u.contractor_id };
    },

    // ---- Заявки (диспетчер) ----
    getRequests: async (params) => {
      await sleep();
      const q = params ?? {};
      const list = requests.filter((r) => matches(r, q));
      list.sort((a, b) => {
        if (q.sort === 'detected_at') return b.detected_at.localeCompare(a.detected_at);
        if (a.defect_class !== b.defect_class) return a.defect_class === 'big' ? -1 : 1;
        const ga = a.street_group ? GROUP_ORDER[a.street_group] : 99;
        const gb = b.street_group ? GROUP_ORDER[b.street_group] : 99;
        if (ga !== gb) return ga - gb;
        const da = dueAt(a) ?? '9';
        const db = dueAt(b) ?? '9';
        return da !== db ? da.localeCompare(db) : a.detected_at.localeCompare(b.detected_at);
      });
      return paginate(list.map(toSummary), q.limit, q.offset);
    },

    getRequestById: async (id) => {
      await sleep(80);
      return toOut(findRec(id));
    },

    getRequestEvents: async (id) => {
      await sleep(60);
      findRec(id);
      return clone(events[id] ?? []);
    },

    updateRequestClass: async (id, defect_class, version) => {
      await sleep();
      const r = findRec(id);
      if (!ALLOWED_FROM.includes(r.status)) throw conflict('Класс можно менять только в статусах «На проверке» и «Требует уточнения».');
      const next = update(id, version, { defect_class });
      pushEvent(id, 'class_changed', actorName(currentUser()), { from: r.defect_class, to: defect_class });
      return toOut(next);
    },

    updateRequestStreetGroup: async (id, street_group, version) => {
      await sleep();
      const r = findRec(id);
      const next = update(id, version, { street_group });
      pushEvent(id, 'group_changed', actorName(currentUser()), { from: r.street_group, to: street_group });
      return toOut(next);
    },

    setRequestContractor: async (id, contractor_id, version) => {
      await sleep();
      const c = contractors.find((x) => x.id === contractor_id);
      if (!c || !c.is_active) throw invalid('Подрядчик не найден или отключён.');
      const r = findRec(id);
      // Если заявка «Принято», она сразу переходит в «В работе»
      const next = update(id, version, { contractor_id, status: r.status === 'accepted' ? 'in_progress' : r.status });
      pushEvent(id, 'contractor_changed', actorName(currentUser()), { to: c.name });
      if (r.status === 'accepted') pushEvent(id, 'status_changed', actorName(currentUser()), { from: 'accepted', to: 'in_progress' });
      return toOut(next);
    },

    updateRequestStatus: async (id, body) => {
      await sleep();
      const r = findRec(id);
      if (r.version !== body.version) throw conflict('Заявку уже изменил другой пользователь. Обновите карточку.');
      if (!ALLOWED_FROM.includes(r.status) || !DECISIONS.includes(body.to)) {
        throw conflict(`Переход «${STATUS_LABEL[r.status]}» → «${STATUS_LABEL[body.to]}» не разрешён.`);
      }
      if (body.to === 'accepted' && r.street_group === null) throw conflict('Нельзя принять заявку без группы улицы.');
      if (body.to === 'rejected' && (!body.reject_reason || !body.comment?.trim())) {
        throw invalid('Для отклонения укажите причину и комментарий.');
      }
      const next = update(id, body.version, {
        status: body.to,
        reject_reason: body.to === 'rejected' ? body.reject_reason ?? null : null,
        decision_comment: body.comment?.trim() || null,
      });
      pushEvent(id, 'status_changed', actorName(currentUser()), { from: r.status, to: body.to });
      return toOut(next);
    },

    getRequestNotes: async (id) => {
      await sleep(60);
      findRec(id);
      return clone(notes[id] ?? []);
    },

    addRequestNote: async (id, text) => {
      await sleep(80);
      findRec(id);
      const u = currentUser();
      const note: NoteOut = { id: nextNoteId++, author: { id: u.id, name: actorName(u) }, text, created_at: new Date().toISOString() };
      (notes[id] ??= []).push(note);
      pushEvent(id, 'note_added', actorName(u));
      return clone(note);
    },

    mergeRequest: async (id, into_id, version) => {
      await sleep();
      const target = findRec(into_id);
      update(id, version, { merged_into_id: into_id, duplicate_of_id: into_id });
      requests = requests.map((x) => (x.id === into_id ? { ...x, duplicates_count: x.duplicates_count + 1 } : x));
      pushEvent(id, 'merged', actorName(currentUser()), { into_id });
      return toOut(findRec(target.id));
    },

    removeDuplicateFlag: async (id, version) => {
      await sleep();
      const next = update(id, version, { duplicates_count: 0, duplicate_of_id: null });
      pushEvent(id, 'duplicate_flag_removed', actorName(currentUser()));
      return toOut(next);
    },

    // ---- Подрядчик ----
    getContractorRequests: async (params) => {
      await sleep();
      const me = currentUser();
      const list = requests
        .filter((r) => r.merged_into_id === null && r.contractor_id === me.contractor_id && r.status !== 'on_review' && r.status !== 'rejected' && r.status !== 'needs_clarification')
        .filter((r) => !params?.overdue || isOverdue(r))
        .sort((a, b) => a.detected_at.localeCompare(b.detected_at))
        .map<RequestSummary>((r) => {
          const { id, status: st, defect_class, address, detected_at, planned_due_at, is_overdue } = toContractorOut(r);
          return { id, status: st, defect_class, address, detected_at, planned_due_at, is_overdue };
        });
      return paginate(list, params?.limit, params?.offset);
    },

    getContractorRequestById: async (id) => {
      await sleep(80);
      const r = requests.find((x) => x.id === id && x.contractor_id === currentUser().contractor_id);
      if (!r) throw notFound();
      return toContractorOut(r);
    },

    completeContractorRequest: async (id, image) => {
      await sleep(300);
      const r = requests.find((x) => x.id === id && x.contractor_id === currentUser().contractor_id);
      if (!r) throw notFound();
      if (image.type !== 'image/jpeg' && image.type !== 'image/png') throw invalid('Фото должно быть в формате JPEG или PNG.');
      if (r.status !== 'in_progress' && r.status !== 'accepted') throw conflict('Заявку нельзя завершить в текущем статусе.');
      const next = update(id, r.version, { status: 'done', completed_at: new Date().toISOString(), photo_after: true });
      pushEvent(id, 'status_changed', actorName(currentUser()), { from: r.status, to: 'done' });
      return toContractorOut(next);
    },

    // ---- Плановый ремонт ----
    getPlannedRepairs: async (params) => {
      await sleep();
      const items = DEMO_PLANNED.filter(
        (p) => (!params?.status || p.status === params.status) && (!params?.street_group || p.street_group === params.street_group)
      );
      const offset = params?.offset ?? 0;
      const limit = params?.limit ?? 50;
      return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
    },

    getPlannedRepair: async (id) => {
      await sleep();
      const found = DEMO_PLANNED.find((p) => p.id === id);
      if (!found) throw new ApiError('Предложение не найдено', 404, 'not_found');
      const requestsOf = Array.from({ length: found.pits_count }, (_, i) => ({
        id: found.id * 100 + i + 1,
        status: { code: 'rejected' as const, label: STATUS_LABEL.rejected },
        defect_class: 'small' as const,
        address: found.street.name,
        detected_at: found.created_at,
        planned_due_at: null,
        is_overdue: false,
      }));
      return { ...found, requests: requestsOf };
    },

    decidePlannedRepair: async (id, decision, comment) => {
      await sleep();
      const found = DEMO_PLANNED.find((p) => p.id === id);
      if (!found) throw new ApiError('Предложение не найдено', 404, 'not_found');
      const allowed = decision === 'done' ? found.status === 'planned' : found.status === 'open';
      if (!allowed) throw new ApiError('Предложение уже в другом состоянии: обновите страницу', 409, 'invalid_transition');
      found.status = decision === 'plan' ? 'planned' : decision === 'spot' ? 'declined' : 'done';
      found.decided_at = new Date().toISOString();
      found.decision_comment = comment ?? null;
      return { ...found, requests: [] };
    },

    // ---- Карта ----
    // В демо-режиме улиц нет, поэтому окрашивать нечего: тепловая карта пустая
    getHeatmap: async (params) => {
      await sleep();
      const detail = params.zoom <= 12 ? 'street' : params.zoom <= 15 ? 'piece' : 'segment';
      return { type: 'FeatureCollection', detail, features: [], outside_streets: 0 };
    },

    getMapPoints: async (params) => {
      await sleep();
      const [w, s, e, n] = params.bbox.split(',').map(Number);
      const q: RequestsQuery = { ...params };
      return requests
        .filter((r) => matches(r, q) && r.lon >= w && r.lon <= e && r.lat >= s && r.lat <= n)
        .map<MapPoint>((r) => ({
          id: r.id,
          lat: r.lat,
          lon: r.lon,
          status: r.status,
          defect_class: r.defect_class,
          is_overdue: isOverdue(r),
          address: r.address,
          street_group: r.street_group,
          district: refDistrict(r.district_id),
          contractor: refContractor(r.contractor_id),
          detected_at: r.detected_at,
          planned_due_at: dueAt(r),
        }));
    },

    // ---- Справочники ----
    getDistricts: async () => clone(districts),

    createDistrict: async (name) => {
      await sleep(80);
      if (districts.some((d) => d.name.toLowerCase() === name.toLowerCase())) throw conflict('Такой район уже есть.');
      const d = { id: Math.max(0, ...districts.map((x) => x.id)) + 1, name };
      districts = [...districts, d];
      return d;
    },

    updateDistrict: async (id, name) => {
      await sleep(80);
      if (!districts.some((d) => d.id === id)) throw notFound();
      districts = districts.map((d) => (d.id === id ? { ...d, name } : d));
      return { id, name };
    },

    deleteDistrict: async (id) => {
      await sleep(80);
      if (requests.some((r) => r.district_id === id) || streets.some((s) => s.district_id === id)) {
        throw conflict('Район используется в заявках или улицах и не может быть удалён.');
      }
      districts = districts.filter((d) => d.id !== id);
    },

    getStreetGroups: async () => clone(streetGroups),

    updateStreetGroup: async (code, deadline_hours, max_pits) => {
      await sleep(80);
      if (!groupOf(code)) throw notFound();
      // В демо плановый срок считается на лету, поэтому меняется и у текущих заявок
      streetGroups = streetGroups.map((g) => (g.code === code ? { code, deadline_hours, max_pits } : g));
      return { code, deadline_hours, max_pits };
    },

    getStreets: async (params) => {
      await sleep(100);
      const q = params?.q?.toLowerCase();
      const list = streets
        .filter((s) => !q || s.name.toLowerCase().includes(q))
        .filter((s) => params?.district_id == null || s.district_id === params.district_id)
        .filter((s) => !params?.street_group || s.street_group === params.street_group)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      return paginate(clone(list), params?.limit, params?.offset);
    },

    createStreet: async (body) => {
      await sleep(100);
      if (streets.some((s) => s.name.toLowerCase() === body.name.toLowerCase())) throw conflict('Такая улица уже есть в справочнике.');
      const s: StreetOut = { id: Math.max(0, ...streets.map((x) => x.id)) + 1, osm_id: null, ...body };
      streets = [...streets, s];
      return clone(s);
    },

    updateStreet: async (id, body) => {
      await sleep(100);
      const cur = streets.find((s) => s.id === id);
      if (!cur) throw notFound();
      const next: StreetOut = {
        ...cur,
        name: body.name ?? cur.name,
        street_group: body.street_group === undefined ? cur.street_group : body.street_group,
        district_id: body.district_id ?? cur.district_id,
      };
      streets = streets.map((s) => (s.id === id ? next : s));
      return clone(next);
    },

    deleteStreet: async (id) => {
      await sleep(80);
      streets = streets.filter((s) => s.id !== id);
    },

    getContractors: async (params) => {
      await sleep(60);
      return clone(contractors.filter((c) => params?.is_active === undefined || c.is_active === params.is_active));
    },

    createContractor: async (body) => {
      await sleep(100);
      const c: ContractorOut = { id: Math.max(0, ...contractors.map((x) => x.id)) + 1, zone: null, is_active: true, ...body };
      contractors = [...contractors, { ...c, zone: body.zone ?? null }];
      return clone(contractors[contractors.length - 1]);
    },

    updateContractor: async (id, body) => {
      await sleep(100);
      const cur = contractors.find((c) => c.id === id);
      if (!cur) throw notFound();
      const next: ContractorOut = {
        ...cur,
        name: body.name ?? cur.name,
        phone: body.phone ?? cur.phone,
        email: body.email ?? cur.email,
        zone: body.zone === undefined ? cur.zone : body.zone,
        is_active: body.is_active ?? cur.is_active,
      };
      contractors = contractors.map((c) => (c.id === id ? next : c));
      return clone(next);
    },

    deleteContractor: async (id) => {
      await sleep(80);
      if (requests.some((r) => r.contractor_id === id) || users.some((u) => u.contractor_id === id)) {
        throw conflict('На подрядчика ссылаются заявки или сотрудники. Отключите его вместо удаления.');
      }
      contractors = contractors.filter((c) => c.id !== id);
    },

    // ---- Пользователи ----
    getUsers: async (params) => {
      await sleep(100);
      const list = users
        .filter((u) => !params?.role || u.role === params.role)
        .filter((u) => params?.is_active === undefined || u.is_active === params.is_active);
      return paginate(clone(list), params?.limit, params?.offset);
    },

    createUser: async (body) => {
      await sleep(120);
      if (users.some((u) => u.login === body.login)) throw conflict('Пользователь с таким логином уже есть.');
      if (body.role === 'contractor' && body.contractor_id == null) throw invalid('Для подрядчика укажите организацию.');
      const u: UserOut = {
        id: Math.max(0, ...users.map((x) => x.id)) + 1,
        login: body.login,
        first_name: body.first_name,
        last_name: body.last_name,
        role: body.role,
        is_active: true,
        contractor_id: body.role === 'contractor' ? body.contractor_id ?? null : null,
      };
      users = [...users, u];
      passwords.set(u.id, body.password);
      return clone(u);
    },

    updateUser: async (id, body) => {
      await sleep(100);
      const cur = users.find((u) => u.id === id);
      if (!cur) throw notFound();
      const next: UserOut = {
        ...cur,
        first_name: body.first_name ?? cur.first_name,
        last_name: body.last_name ?? cur.last_name,
        is_active: body.is_active ?? cur.is_active,
        contractor_id: body.contractor_id === undefined ? cur.contractor_id : body.contractor_id,
      };
      users = users.map((u) => (u.id === id ? next : u));
      return clone(next);
    },

    resetUserPassword: async (id, password) => {
      await sleep(100);
      if (!users.some((u) => u.id === id)) throw notFound();
      passwords.set(id, password);
    },
  };
}
