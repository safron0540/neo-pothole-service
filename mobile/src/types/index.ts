// Временные типы под моки. После получения OpenAPI заменить сгенерированными.
export type ReportStatus =
  | 'На проверке'
  | 'Принято'
  | 'Отклонено'
  | 'Требует уточнения'
  | 'В работе'
  | 'Выполнено';

export interface StatusEvent {
  at: string; // ISO, UTC
  text: string;
}

export interface Report {
  id: number;
  address: string | null;
  status: ReportStatus;
  createdAt: string | null; // ISO, UTC
  defectClass: 'Большая' | 'Маленькая' | null;
  lat: number | null;
  lng: number | null;
  comment?: string;
  photoBeforeUrl?: string;
  photoAfterUrl?: string;
  history: StatusEvent[];
}
