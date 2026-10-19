const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4010/api/v1';

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
    throw new Error(errorBody.message || `Ошибка сервера: ${response.status}`);
  }

  return response.json();
}

export const api = {
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
    return request<{ total: number; items: any[] }>(`/requests${queryString}`);
  },

  getRequestById: (id: number | string) => request<any>(`/requests/${id}`),

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

  getMapPoints: (params?: { status?: string; bbox?: string }) => {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'Все') query.set('status', params.status);
    if (params?.bbox) query.set('bbox', params.bbox);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<Array<{ id: number; lat: number; lon: number; status: string; defect_class: string }>>(`/map/points${queryString}`);
  },
};