import type { Report } from '../types';

export const mockReports: Report[] = [
  {
    id: 1042, address: 'ул. Ленина, 15', status: 'Принято',
    createdAt: '2026-10-02T07:32:00Z', defectClass: 'Большая', lat: 56.4846, lng: 84.9476,
    history: [
      { at: '2026-10-02T07:32:00Z', text: 'Заявка создана' },
      { at: '2026-10-02T07:34:00Z', text: 'Автоматическая проверка геопозиции и фото пройдена' },
    ],
  },
  {
    id: 1043, address: 'ул. Ленина, 15', status: 'Выполнено',
    createdAt: '2026-10-02T07:40:00Z', defectClass: 'Большая', lat: 56.4902, lng: 84.9561,
    history: [{ at: '2026-10-02T07:40:00Z', text: 'Заявка создана' }],
  },
  {
    id: 1044, address: 'ул. Ленина, 15', status: 'Отклонено',
    createdAt: '2026-10-02T08:10:00Z', defectClass: 'Маленькая', lat: 56.4795, lng: 84.9382,
    history: [{ at: '2026-10-02T08:10:00Z', text: 'Заявка создана' }],
  },
  {
    id: 1045, address: 'ул. Ленина, 15', status: 'В работе',
    createdAt: '2026-10-02T09:00:00Z', defectClass: 'Большая', lat: 56.4871, lng: 84.9299,
    history: [{ at: '2026-10-02T09:00:00Z', text: 'Заявка создана' }],
  },
];
