// Общие справочники и демо-данные. Используются, пока бэкенд недоступен,
// и одинаковы для страниц «Требует решения», «Карта заявок» и «Администрирование».

export type RequestStatus =
  | 'На проверке'
  | 'Принято'
  | 'В работе'
  | 'Выполнено'
  | 'Требует уточнения'
  | 'Отклонено';

export type DefectClass = 'big' | 'small';
export type StreetGroup = 'А' | 'Б' | 'В';

export const DEFECT_CLASS_LABEL: Record<DefectClass, string> = {
  big: 'Большая',
  small: 'Маленькая',
};

export const DISTRICTS = ['Кировский', 'Ленинский', 'Октябрьский', 'Советский'] as const;
export const STREET_GROUPS: StreetGroup[] = ['А', 'Б', 'В'];

export interface Contractor {
  id: number;
  name: string;
  color: string;
  contact: string;
  zone: [number, number][];
}

export const CONTRACTORS: Contractor[] = [
  {
    id: 1,
    name: 'ООО «ДорСтрой-Лидер»',
    color: '#2563EB',
    contact: 'Соколов В. П. • +7 (903) 124–55–88',
    zone: [[56.455, 84.94], [56.47, 84.94], [56.47, 84.97], [56.455, 84.97]],
  },
  {
    id: 2,
    name: 'МУП «Автодор-Север»',
    color: '#16A34A',
    contact: 'Смирнов А. Н. • +7 (985) 674–12–90',
    zone: [[56.48, 84.96], [56.505, 84.96], [56.505, 85.0], [56.48, 85.0]],
  },
  {
    id: 3,
    name: 'ООО «Магистраль-Юг»',
    color: '#EA580C',
    contact: 'Кузнецов Д. И. • +7 (916) 120–09–33',
    zone: [[56.43, 84.93], [56.452, 84.93], [56.452, 84.98], [56.43, 84.98]],
  },
];

export const contractorName = (id?: number | null) =>
  CONTRACTORS.find((c) => c.id === id)?.name ?? '—';

export interface HistoryItem {
  time: string;
  status_from: RequestStatus | null;
  status_to: RequestStatus;
  user: string;
}

export interface RequestItem {
  id: number;
  version: number;
  address: string;
  full_address?: string;
  defect_class: DefectClass;
  status: RequestStatus;
  street_group: StreetGroup;
  district?: string;
  contractor_id?: number | null;
  contractor_name?: string | null;
  planned_due?: string;
  created_at?: string;
  applicant_phone?: string;
  applicant_name?: string;
  lat?: number;
  lon?: number;
  recommended_status?: string;
  photo_url?: string | null;
  history?: HistoryItem[];
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 36e5).toISOString();

function demo(
  r: Omit<RequestItem, 'version' | 'full_address' | 'contractor_name' | 'history'> & { hoursAgo: number }
): RequestItem {
  const { hoursAgo, ...rest } = r;
  const created = hoursFromNow(-hoursAgo);
  const history: HistoryItem[] = [
    { time: created, status_from: null, status_to: 'На проверке', user: rest.applicant_name ?? 'Гражданин' },
  ];
  if (rest.status !== 'На проверке') {
    history.push({
      time: hoursFromNow(-hoursAgo + 2),
      status_from: 'На проверке',
      status_to: rest.status,
      user: 'Иванова Е. А.',
    });
  }
  return {
    ...rest,
    version: rest.status === 'На проверке' ? 1 : 2,
    full_address: `г. Томск, ${rest.address}`,
    contractor_name: contractorName(rest.contractor_id),
    created_at: created,
    history,
  };
}

export const DEMO_REQUESTS: RequestItem[] = [
  demo({ id: 20092026, address: 'ул. Ленина, 15', defect_class: 'big', status: 'На проверке', street_group: 'А', district: 'Ленинский', contractor_id: 1, planned_due: hoursFromNow(24), hoursAgo: 5, applicant_phone: '+7 913 123-45-67', applicant_name: 'Иванов А. А.', lat: 56.467, lon: 84.952, recommended_status: 'Принято' }),
  demo({ id: 200292027, address: 'ул. Смольная, 19', defect_class: 'big', status: 'На проверке', street_group: 'Б', district: 'Советский', contractor_id: 2, planned_due: hoursFromNow(72), hoursAgo: 7, applicant_phone: '+7 999 123-45-67', applicant_name: 'Петров В. В.', lat: 56.495, lon: 84.975, recommended_status: 'Принято' }),
  demo({ id: 200292028, address: 'просп. Мира, 102', defect_class: 'big', status: 'На проверке', street_group: 'В', district: 'Октябрьский', contractor_id: 3, planned_due: hoursFromNow(168), hoursAgo: 25, applicant_phone: '+7 905 000-11-22', applicant_name: 'Сидоров С. С.', lat: 56.442, lon: 84.955, recommended_status: 'Принято' }),
  demo({ id: 200292029, address: 'ул. Учебная, 8', defect_class: 'small', status: 'На проверке', street_group: 'А', district: 'Ленинский', contractor_id: 1, planned_due: hoursFromNow(5), hoursAgo: 4, applicant_phone: '+7 913 222-33-44', applicant_name: 'Кузнецов Д. И.', lat: 56.459, lon: 84.948, recommended_status: 'Отклонено' }),
  demo({ id: 200292030, address: 'ул. 79 Гвардейской дивизии, 14', defect_class: 'big', status: 'В работе', street_group: 'А', district: 'Советский', contractor_id: 2, planned_due: hoursFromNow(12), hoursAgo: 30, applicant_phone: '+7 923 555-10-20', applicant_name: 'Орлова М. С.', lat: 56.488, lon: 84.968 }),
  demo({ id: 200292031, address: 'ул. Красноармейская, 67', defect_class: 'small', status: 'Принято', street_group: 'Б', district: 'Кировский', contractor_id: 1, planned_due: hoursFromNow(48), hoursAgo: 20, applicant_phone: '+7 952 700-30-40', applicant_name: 'Белов П. Р.', lat: 56.462, lon: 84.96 }),
  demo({ id: 200292032, address: 'пр. Фрунзе, 96', defect_class: 'big', status: 'Выполнено', street_group: 'А', district: 'Ленинский', contractor_id: 3, planned_due: hoursFromNow(-48), hoursAgo: 240, applicant_phone: '+7 913 808-09-10', applicant_name: 'Тихонов Е. А.', lat: 56.448, lon: 84.94 }),
  demo({ id: 200292033, address: 'ул. Нахимова, 13', defect_class: 'small', status: 'Отклонено', street_group: 'В', district: 'Октябрьский', contractor_id: 3, planned_due: hoursFromNow(-10), hoursAgo: 100, applicant_phone: '+7 961 111-22-33', applicant_name: 'Громов И. К.', lat: 56.436, lon: 84.965 }),
  demo({ id: 200292034, address: 'ул. Лебедева, 39', defect_class: 'small', status: 'Требует уточнения', street_group: 'Б', district: 'Советский', contractor_id: 2, planned_due: hoursFromNow(36), hoursAgo: 15, applicant_phone: '+7 960 444-55-66', applicant_name: 'Фомина А. В.', lat: 56.5, lon: 84.99 }),
];
