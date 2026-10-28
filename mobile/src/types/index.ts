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
  address: string;
  status: ReportStatus;
  createdAt: string; // ISO, UTC
  defectClass: 'Большая' | 'Маленькая';
  lat: number;
  lng: number;
  comment?: string;
  history: StatusEvent[];
}
