// Типы по docs/mobile-api.md. Когда будет docs/openapi.json — заменить сгенерированными
// (например, openapi-typescript) и сверить поля карточки заявки в mappers.ts.
export type StatusCode =
  | 'on_review'
  | 'accepted'
  | 'rejected'
  | 'needs_clarification'
  | 'in_progress'
  | 'done';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface RegisterBody {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  consent_pd: true;
  consent_geo: true;
}

export interface AnalyzeResult {
  photo_id: string;
  model_unavailable: boolean;
  defect_class: string | null; // 'big' | 'small'
  pits_count: number | null;
  model_version?: string | null;
}

export interface CreateRequestBody {
  client_request_id: string;
  photo_id: string;
  location: { lat: number; lon: number };
  accuracy_m: number | null;
  citizen_comment?: string;
  manual_class?: 'big' | 'small';
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
