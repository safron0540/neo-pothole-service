import type { RequestItem } from '../data/reference';

export type MapPoint = Pick<RequestItem, 'id' | 'lat' | 'lon' | 'status' | 'defect_class'> &
  Partial<Pick<RequestItem, 'address' | 'street_group' | 'district' | 'contractor_id' | 'contractor_name' | 'created_at' | 'planned_due'>>;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4010/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(errorBody.message || `Ошибка сервера: ${response.status}`, response.status);
  }

  return response.json();
}

export const api = {
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_role');
  },

  staffLogin: async (login: string, password: string) => {
    const data = await request<{ access: string; refresh: string; role: 'dispatcher' | 'contractor' }>(
      '/auth/staff/login',
      {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      }
    );
    if (data.access) {
      localStorage.setItem('access_token', data.access);
      localStorage.setItem('user_role', data.role);
    }
    return data;
  },

  getRequests: (params?: { status?: string; sort?: string; district?: string }) => {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'Все') query.set('status', params.status);
    if (params?.sort) query.set('sort', params.sort);
    if (params?.district && params.district !== 'Все') query.set('district', params.district);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<{ total: number; items: RequestItem[] }>(`/requests${queryString}`);
  },

  getRequestById: (id: number | string) => request<RequestItem>(`/requests/${id}`),

  // Корректировка класса ямы и группы улицы диспетчером (см. PATCH /requests/{id} в openapi.yaml)
  updateRequestFields: (
    id: number | string,
    fields: { defect_class?: string; street_group?: string; version: number }
  ) =>
    request<{ id: number; version: number }>(`/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    }),

  setRequestContractor: (id: number | string, contractorId: number) =>
    request<{ id: number; contractor_id: number; status: string }>(`/requests/${id}/contractor`, {
      method: 'PUT',
      body: JSON.stringify({ contractor_id: contractorId }),
    }),

  updateStreetGroup: (code: string, deadlineHours: number, maxPits: number) =>
    request<{ code: string; deadline_hours: number; max_pits: number }>(`/street-groups/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify({ deadline_hours: deadlineHours, max_pits: maxPits }),
    }),

  updateRequestStatus: (id: number | string, to: string, version: number, comment?: string) =>
    request<{ id: number; status: string; version: number }>(`/requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ to, version, comment: comment || '' }),
    }),

  getContractorRequests: () => request<{ total: number; items: any[] }>('/contractor/requests'),

  completeContractorRequest: async (id: number | string, photoFile: File) => {
    const token = localStorage.getItem('access_token');
    const formData = new FormData();
    formData.append('photo', photoFile);

    const response = await fetch(`${API_BASE_URL}/contractor/requests/${id}/complete`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || 'Ошибка завершения наряда');
    }

    return response.json();
  },

  getMapPoints: (params?: {
    status?: string;
    bbox?: string;
    district?: string;
    street_group?: string;
    defect_class?: string;
    contractor_id?: number;
    created_from?: string;
  }) => {
    const query = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== 'Все') query.set(key, String(value));
    });
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<MapPoint[]>(`/map/points${queryString}`);
  },
};