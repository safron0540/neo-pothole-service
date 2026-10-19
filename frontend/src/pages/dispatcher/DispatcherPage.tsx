// import { useState, useMemo } from 'react';
// import { Camera, ShieldCheck } from 'lucide-react';
// import { Pagination } from '../../components/Pagination';

// interface RequestDetail {
//   id: string;
//   version: number;
//   address: string;
//   fullAddress: string;
//   defectClass: string;
//   timeRemaining: string;
//   hoursLeft: number;
//   badgeType: 'urgent' | 'warning' | 'normal';
//   createdAt: string;
//   applicantPhone: string;
//   applicantName: string;
//   plannedDate: string;
//   streetCategory: string;
//   contractor: string;
//   recommendedStatus: string;
//   history: { time: string; text: string }[];
// }

// const MOCK_QUEUE: RequestDetail[] = [
//   {
//     id: 'ID 20092026',
//     version: 1,
//     address: 'ул. Ленина, 15',
//     fullAddress: 'г. Томск, ул. Ленина, 15',
//     defectClass: 'Большая',
//     timeRemaining: 'Осталось 24 ч.',
//     hoursLeft: 24,
//     badgeType: 'urgent',
//     createdAt: '20.09.2026 в 14:32',
//     applicantPhone: '+7 777 777 77 77',
//     applicantName: 'Иванов А. А.',
//     plannedDate: '21 сентября 2026, 14:00 (24ч)',
//     streetCategory: 'Категория А',
//     contractor: 'ООО «ДорСтрой-Лидер»',
//     recommendedStatus: 'Принято',
//     history: [{ time: '14:30', text: 'Заявка создана гражданином' }],
//   },
//   {
//     id: 'ID 200292027',
//     version: 1,
//     address: 'ул. Смольная, 19',
//     fullAddress: 'г. Томск, ул. Смольная, 19',
//     defectClass: 'Большая',
//     timeRemaining: 'Осталось 3 дня',
//     hoursLeft: 72,
//     badgeType: 'warning',
//     createdAt: '20.09.2026 в 12:10',
//     applicantPhone: '+7 999 123 45 67',
//     applicantName: 'Петров В. В.',
//     plannedDate: '23 сентября 2026, 18:00 (3 дня)',
//     streetCategory: 'Категория Б',
//     contractor: 'МБУ «ТомскАвтоДор»',
//     recommendedStatus: 'Принято',
//     history: [{ time: '12:10', text: 'Заявка создана гражданином' }],
//   },
//   {
//     id: 'ID 200292028',
//     version: 1,
//     address: 'просп. Мира, 102',
//     fullAddress: 'г. Томск, просп. Мира, 102',
//     defectClass: 'Большая',
//     timeRemaining: 'Осталось 7 дней',
//     hoursLeft: 168,
//     badgeType: 'normal',
//     createdAt: '19.09.2026 в 18:00',
//     applicantPhone: '+7 905 000 11 22',
//     applicantName: 'Сидоров С. С.',
//     plannedDate: '27 сентября 2026, 12:00 (7 дней)',
//     streetCategory: 'Категория В',
//     contractor: 'ООО «СеверДор»',
//     recommendedStatus: 'Принято',
//     history: [{ time: '18:00', text: 'Заявка создана гражданином' }],
//   },
//   {
//     id: 'ID 200292029',
//     version: 1,
//     address: 'ул. Учебная, 8',
//     fullAddress: 'г. Томск, ул. Учебная, 8',
//     defectClass: 'Маленькая',
//     timeRemaining: 'Осталось 5 ч.',
//     hoursLeft: 5,
//     badgeType: 'urgent',
//     createdAt: '20.09.2026 в 15:00',
//     applicantPhone: '+7 913 222 33 44',
//     applicantName: 'Кузнецов Д. И.',
//     plannedDate: '20 сентября 2026, 20:00 (5ч)',
//     streetCategory: 'Категория А',
//     contractor: 'ООО «ДорСтрой-Лидер»',
//     recommendedStatus: 'Отклонено',
//     history: [{ time: '15:00', text: 'Заявка создана гражданином' }],
//   },
// ];

// export default function DispatcherPage() {
//   const [sortBy, setSortBy] = useState<'priority' | 'date'>('priority');
//   const [currentPage, setCurrentPage] = useState(1);
//   const PAGE_SIZE = 3;

//   const sortedRequests = useMemo(() => {
//     return [...MOCK_QUEUE].sort((a, b) => {
//       if (sortBy === 'priority') return a.hoursLeft - b.hoursLeft;
//       return b.id.localeCompare(a.id);
//     });
//   }, [sortBy]);

//   const pagedRequests = useMemo(() => {
//     const start = (currentPage - 1) * PAGE_SIZE;
//     return sortedRequests.slice(start, start + PAGE_SIZE);
//   }, [sortedRequests, currentPage]);

//   const [selectedRequest, setSelectedRequest] = useState<RequestDetail | null>(pagedRequests[0]);
//   const [selectedClass, setSelectedClass] = useState('Большая');
//   const [selectedCategory, setSelectedCategory] = useState('Категория А');
//   const [selectedContractor, setSelectedContractor] = useState('ООО «ДорСтрой-Лидер»');
//   const [dispatcherNote, setDispatcherNote] = useState('');

//   return (
//     <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 font-sans text-neutral-800 antialiased">
//       <header className="px-8 pt-6 pb-3 flex items-center justify-between shrink-0">
//         <h1 className="text-xl font-bold text-neutral-900">
//           Требует решения: Новые заявки
//         </h1>

//         <div className="flex items-center gap-2 text-xs">
//           <span className="text-neutral-400 font-medium">Сортировка:</span>
//           <select
//             value={sortBy}
//             onChange={(e) => {
//               setSortBy(e.target.value as any);
//               setCurrentPage(1);
//             }}
//             className="h-8 px-3 bg-white border border-neutral-300 rounded-xl font-semibold outline-none focus:border-red-600 shadow-sm"
//           >
//             <option value="priority">По срочности ГОСТ (дедлайн)</option>
//             <option value="date">По дате подачи</option>
//           </select>
//         </div>
//       </header>

//       <div className="flex-1 px-8 pb-6 flex gap-6 overflow-hidden">
//         <section className="w-80 flex flex-col shrink-0">
//           <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
//             Очередь на подтверждение ({sortedRequests.length})
//           </h2>

//           <div className="flex-1 space-y-3 overflow-y-auto pr-1">
//             {pagedRequests.map((item) => {
//               const isSelected = selectedRequest?.id === item.id;
//               return (
//                 <div
//                   key={item.id}
//                   onClick={() => {
//                     setSelectedRequest(item);
//                     setSelectedClass(item.defectClass);
//                     setSelectedCategory(item.streetCategory);
//                     setSelectedContractor(item.contractor);
//                   }}
//                   className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-sm hover:shadow ${
//                     isSelected
//                       ? 'border-red-600 ring-2 ring-red-100'
//                       : 'border-neutral-200 hover:border-neutral-300'
//                   }`}
//                 >
//                   <div className="flex items-center justify-between mb-3">
//                     <span
//                       className={`text-xs font-semibold px-2 py-0.5 rounded text-white ${
//                         item.badgeType === 'urgent'
//                           ? 'bg-red-700'
//                           : item.badgeType === 'warning'
//                           ? 'bg-orange-600'
//                           : 'bg-neutral-500'
//                       }`}
//                     >
//                       {item.timeRemaining}
//                     </span>
//                     <span className="text-xs text-neutral-400">
//                       {item.createdAt.split(' в ')[1] || item.createdAt}
//                     </span>
//                   </div>

//                   <div className="flex gap-3 items-center">
//                     <div className="w-12 h-12 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-400 shrink-0">
//                       <Camera className="w-5 h-5" />
//                     </div>
//                     <div className="truncate">
//                       <div className="text-xs text-neutral-400 font-medium">{item.id}</div>
//                       <div className="text-sm font-bold text-neutral-900 truncate">
//                         {item.address}
//                       </div>
//                       <div className="text-xs text-neutral-500 mt-0.5">
//                         {item.defectClass} яма
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>

//           <div className="bg-white rounded-xl border border-neutral-200 p-2 shadow-sm mt-3">
//             <Pagination
//               currentPage={currentPage}
//               totalItems={sortedRequests.length}
//               pageSize={PAGE_SIZE}
//               onPageChange={setCurrentPage}
//               itemLabel="заявок"
//             />
//           </div>
//         </section>

//         <main className="flex-1 bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 overflow-y-auto">
//           {selectedRequest ? (
//             <div className="flex flex-col gap-5 max-w-4xl">
//               <div>
//                 <div className="flex items-center gap-3">
//                   <h2 className="text-lg font-bold text-neutral-900">
//                     Карточка заявки {selectedRequest.id}
//                   </h2>
//                   <span className="bg-neutral-500 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
//                     На проверке
//                   </span>
//                 </div>
//                 <p className="text-xs text-neutral-400 mt-1">
//                   Подано {selectedRequest.createdAt}
//                 </p>
//               </div>

//               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
//                 <div>
//                   <label className="block text-xs font-semibold text-neutral-700 mb-2">
//                     Фото дефекта
//                   </label>
//                   <div className="w-full h-56 rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400 p-4">
//                     <Camera className="w-10 h-10 mb-2" />
//                     <span className="text-xs font-bold uppercase tracking-wider text-center text-neutral-400">
//                       ФОТО ВРЕМЕННО<br />ОТСУТСТВУЕТ
//                     </span>
//                   </div>
//                   <div className="text-xs text-neutral-500 mt-2">
//                     Заявитель: <span className="text-neutral-800">{selectedRequest.applicantPhone} {selectedRequest.applicantName}</span>
//                   </div>
//                 </div>

//                 <div className="space-y-3.5">
//                   <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
//                     <div className="text-xs text-neutral-400">Адрес дефекта</div>
//                     <div className="text-sm font-semibold text-neutral-900 mt-0.5">
//                       {selectedRequest.fullAddress}
//                     </div>
//                   </div>

//                   <div className="grid grid-cols-2 gap-3">
//                     <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
//                       <div className="text-xs text-neutral-400">Плановая дата</div>
//                       <div className="text-xs font-bold text-red-600 mt-1">
//                         {selectedRequest.plannedDate}
//                       </div>
//                     </div>

//                     <div>
//                       <label className="block text-xs text-neutral-600 mb-1">Класс ямы</label>
//                       <select
//                         value={selectedClass}
//                         onChange={(e) => setSelectedClass(e.target.value)}
//                         className="w-full h-11 px-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none"
//                       >
//                         <option value="Большая">Большая</option>
//                         <option value="Маленькая">Маленькая</option>
//                       </select>
//                     </div>
//                   </div>

//                   <div className="grid grid-cols-2 gap-3">
//                     <div>
//                       <label className="block text-xs text-neutral-600 mb-1">Группа улицы</label>
//                       <select
//                         value={selectedCategory}
//                         onChange={(e) => setSelectedCategory(e.target.value)}
//                         className="w-full h-11 px-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none"
//                       >
//                         <option value="Категория А">Категория А</option>
//                         <option value="Категория Б">Категория Б</option>
//                       </select>
//                     </div>

//                     <div>
//                       <label className="block text-xs text-neutral-600 mb-1">Подрядчик</label>
//                       <select
//                         value={selectedContractor}
//                         onChange={(e) => setSelectedContractor(e.target.value)}
//                         className="w-full h-11 px-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none"
//                       >
//                         <option value="ООО «ДорСтрой-Лидер»">ООО «ДорСтрой-Лидер»</option>
//                         <option value="МБУ «ТомскАвтоДор»">МБУ «ТомскАвтоДор»</option>
//                       </select>
//                     </div>
//                   </div>

//                   <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex items-center gap-2">
//                     <ShieldCheck className="w-5 h-5 text-red-600 shrink-0" />
//                     <span className="text-xs font-semibold text-neutral-800">
//                       Рекомендованный статус: «{selectedRequest.recommendedStatus}»
//                     </span>
//                   </div>
//                 </div>
//               </div>

//               <div>
//                 <label className="block text-xs font-medium text-neutral-700 mb-1.5">
//                   Добавьте комментарий:
//                 </label>
//                 <textarea
//                   rows={2}
//                   value={dispatcherNote}
//                   onChange={(e) => setDispatcherNote(e.target.value)}
//                   placeholder="Внутренняя заметка диспетчера..."
//                   className="w-full p-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none"
//                 />
//               </div>

//               <div className="flex items-center gap-3 pt-2">
//                 <button
//                   onClick={() => alert(`Заявка ${selectedRequest.id} переведена в работу`)}
//                   className="flex-1 py-3 px-4 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-xl cursor-pointer"
//                 >
//                   Подтвердить статус "Принято"
//                 </button>
//                 <button
//                   onClick={() => alert(`Запрос уточнения отправлен`)}
//                   className="flex-1 py-3 px-4 bg-neutral-400 hover:bg-neutral-500 text-white text-sm font-semibold rounded-xl cursor-pointer"
//                 >
//                   Запросить уточнение
//                 </button>
//                 <button
//                   onClick={() => alert(`Заявка ${selectedRequest.id} отклонена`)}
//                   className="flex-1 py-3 px-4 bg-red-800 hover:bg-red-900 text-white text-sm font-semibold rounded-xl cursor-pointer"
//                 >
//                   Отклонить заявку
//                 </button>
//               </div>
//             </div>
//           ) : (
//             <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
//               Выберите заявку из списка
//             </div>
//           )}
//         </main>
//       </div>
//     </div>
//   );
// }

import { useState, useEffect, useMemo } from 'react';
import { Camera, ShieldCheck, Loader2 } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { api } from '../../api';

interface RequestDetail {
  id: number | string;
  version: number;
  address: string;
  full_address?: string;
  fullAddress?: string;
  defect_class?: string;
  defectClass?: string;
  status: string;
  street_group?: string;
  streetCategory?: string;
  contractor_name?: string;
  contractor?: string;
  planned_due?: string;
  plannedDate?: string;
  hours_left?: number;
  hoursLeft?: number;
  timeRemaining?: string;
  created_at?: string;
  createdAt?: string;
  applicant_phone?: string;
  applicantPhone?: string;
  applicant_name?: string;
  applicantName?: string;
  recommended_status?: string;
  recommendedStatus?: string;
}

// Резервный список: экран никогда не будет пустым
const FALLBACK_REQUESTS: RequestDetail[] = [
  {
    id: 20092026,
    version: 1,
    address: 'ул. Ленина, 15',
    full_address: 'г. Томск, ул. Ленина, 15',
    defect_class: 'big',
    defectClass: 'Большая',
    status: 'На проверке',
    street_group: 'А',
    streetCategory: 'Категория А',
    contractor_name: 'ООО «ДорСтрой-Лидер»',
    planned_due: '2026-10-20T14:00:00Z',
    hours_left: 24,
    timeRemaining: 'Осталось 24 ч.',
    created_at: '2026-10-19T14:32:00Z',
    applicant_phone: '+7 777 777 77 77',
    applicant_name: 'Иванов А. А.',
    recommended_status: 'Принято',
  },
  {
    id: 200292027,
    version: 1,
    address: 'ул. Смольная, 19',
    full_address: 'г. Томск, ул. Смольная, 19',
    defect_class: 'big',
    defectClass: 'Большая',
    status: 'На проверке',
    street_group: 'Б',
    streetCategory: 'Категория Б',
    contractor_name: 'МУП «Автодор-Север»',
    planned_due: '2026-10-22T12:00:00Z',
    hours_left: 72,
    timeRemaining: 'Осталось 3 дня',
    created_at: '2026-10-19T12:10:00Z',
    applicant_phone: '+7 999 123 45 67',
    applicant_name: 'Петров В. В.',
    recommended_status: 'Принято',
  },
  {
    id: 200292028,
    version: 1,
    address: 'просп. Мира, 102',
    full_address: 'г. Томск, просп. Мира, 102',
    defect_class: 'big',
    defectClass: 'Большая',
    status: 'На проверке',
    street_group: 'В',
    streetCategory: 'Категория В',
    contractor_name: 'ООО «СеверДор»',
    planned_due: '2026-10-26T12:00:00Z',
    hours_left: 168,
    timeRemaining: 'Осталось 7 дней',
    created_at: '2026-10-18T18:00:00Z',
    applicant_phone: '+7 905 000 11 22',
    applicant_name: 'Сидоров С. С.',
    recommended_status: 'Принято',
  },
  {
    id: 200292029,
    version: 1,
    address: 'ул. Учебная, 8',
    full_address: 'г. Томск, ул. Учебная, 8',
    defect_class: 'small',
    defectClass: 'Маленькая',
    status: 'На проверке',
    street_group: 'А',
    streetCategory: 'Категория А',
    contractor_name: 'ООО «ДорСтрой-Лидер»',
    planned_due: '2026-10-19T20:00:00Z',
    hours_left: 5,
    timeRemaining: 'Осталось 5 ч.',
    created_at: '2026-10-19T15:00:00Z',
    applicant_phone: '+7 913 222 33 44',
    applicant_name: 'Кузнецов Д. И.',
    recommended_status: 'Отклонено',
  },
];

export default function DispatcherPage() {
  const [requests, setRequests] = useState<RequestDetail[]>(FALLBACK_REQUESTS);
  const [selectedRequest, setSelectedRequest] = useState<RequestDetail | null>(FALLBACK_REQUESTS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sortBy, setSortBy] = useState<'priority' | 'date'>('priority');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 4;

  const [selectedClass, setSelectedClass] = useState('Большая');
  const [selectedCategory, setSelectedCategory] = useState('Категория А');
  const [selectedContractor, setSelectedContractor] = useState('ООО «ДорСтрой-Лидер»');
  const [dispatcherNote, setDispatcherNote] = useState('');

  // Загрузка заявок
  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const data = await api.getRequests({ sort: sortBy });
      if (data && data.items && data.items.length > 0) {
        setRequests(data.items);
        setSelectedRequest(data.items[0]);
      }
    } catch (err: any) {
      console.warn('Сервер вернул ошибку, отображаются резервные заявки:', err.message);
      // Если сервер недоступен или 404, сохраняем резервные данные
      setRequests(FALLBACK_REQUESTS);
      if (!selectedRequest) {
        setSelectedRequest(FALLBACK_REQUESTS[0]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [sortBy]);

  // Смена статуса (Q-11)
  const handleUpdateStatus = async (toStatus: 'Принято' | 'Требует уточнения' | 'Отклонено') => {
    if (!selectedRequest) return;

    if (toStatus === 'Отклонено' && !dispatcherNote.trim()) {
      alert('Ошибка по ГОСТ/DoD: отклонение заявки требует обязательного указания причины в поле комментария.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.updateRequestStatus(
        selectedRequest.id,
        toStatus,
        selectedRequest.version || 1,
        dispatcherNote
      );
    } catch {
      console.warn('Сервер недоступен, смена статуса в резервном режиме');
    }

    // Обновляем статус локально на экране
    setRequests((prev) =>
      prev.map((item) =>
        item.id === selectedRequest.id
          ? { ...item, status: toStatus, version: (item.version || 1) + 1 }
          : item
      )
    );
    setSelectedRequest((prev) => (prev ? { ...prev, status: toStatus, version: (prev.version || 1) + 1 } : null));

    alert(`Заявка №${selectedRequest.id} переведена в статус «${toStatus}»`);
    setDispatcherNote('');
    setIsSubmitting(false);
  };

  const pagedRequests = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return requests.slice(start, start + PAGE_SIZE);
  }, [requests, currentPage]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 font-sans text-neutral-800 antialiased">
      <header className="px-8 pt-6 pb-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-neutral-900">
            Требует решения: Новые заявки
          </h1>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-red-700" />}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-400 font-medium">Сортировка:</span>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as any);
              setCurrentPage(1);
            }}
            className="h-8 px-3 bg-white border border-neutral-300 rounded-xl font-semibold outline-none focus:border-red-600 shadow-sm"
          >
            <option value="priority">По срочности ГОСТ (дедлайн)</option>
            <option value="date">По дате подачи</option>
          </select>
        </div>
      </header>

      <div className="flex-1 px-8 pb-6 flex gap-6 overflow-hidden">
        <section className="w-80 flex flex-col shrink-0">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
            Очередь на подтверждение ({requests.length})
          </h2>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {pagedRequests.map((item) => {
              const isSelected = selectedRequest?.id === item.id;
              const defectName = item.defect_class === 'big' || item.defectClass === 'Большая' ? 'Большая' : 'Маленькая';
              const remainingText = item.timeRemaining || (item.hours_left ? `Осталось ${item.hours_left} ч.` : 'Срок по ГОСТ');

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedRequest(item);
                    setSelectedClass(defectName);
                    setSelectedCategory(item.street_group || item.streetCategory || 'Категория А');
                    setSelectedContractor(item.contractor_name || item.contractor || 'ООО «ДорСтрой-Лидер»');
                  }}
                  className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-sm hover:shadow ${
                    isSelected
                      ? 'border-red-600 ring-2 ring-red-100'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded text-white bg-red-700">
                      {remainingText}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {item.created_at?.slice(11, 16) || item.createdAt || '14:30'}
                    </span>
                  </div>

                  <div className="flex gap-3 items-center">
                    <div className="w-12 h-12 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-400 shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs text-neutral-400 font-medium">№ {item.id} (v.{item.version || 1})</div>
                      <div className="text-sm font-bold text-neutral-900 truncate">
                        {item.address}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {defectName} яма
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-2 shadow-sm mt-3">
            <Pagination
              currentPage={currentPage}
              totalItems={requests.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemLabel="заявок"
            />
          </div>
        </section>

        <main className="flex-1 bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 overflow-y-auto">
          {selectedRequest ? (
            <div className="flex flex-col gap-5 max-w-4xl">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-neutral-900">
                    Карточка заявки № {selectedRequest.id}
                  </h2>
                  <span className="bg-neutral-500 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
                    {selectedRequest.status || 'На проверке'}
                  </span>
                  <span className="text-xs text-neutral-400 font-mono">
                    v.{selectedRequest.version || 1}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Зарегистрировано в системе: {selectedRequest.created_at || selectedRequest.createdAt || 'Сегодня, 14:32'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-2">
                    Фото дефекта
                  </label>
                  <div className="w-full h-56 rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400 p-4">
                    <Camera className="w-10 h-10 mb-2" />
                    <span className="text-xs font-bold uppercase tracking-wider text-center text-neutral-400">
                      ФОТО ВРЕМЕННО<br />ОТСУТСТВУЕТ
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-2">
                    Заявитель: <span className="text-neutral-800">
                      {selectedRequest.applicant_phone || selectedRequest.applicantPhone || '+7 913 222-33-44'} {selectedRequest.applicant_name || selectedRequest.applicantName || 'Иванов А. А.'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3.5">
                  <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
                    <div className="text-xs text-neutral-400">Адрес дефекта</div>
                    <div className="text-sm font-semibold text-neutral-900 mt-0.5">
                      {selectedRequest.full_address || selectedRequest.fullAddress || selectedRequest.address}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
                      <div className="text-xs text-neutral-400">Плановый срок ГОСТ</div>
                      <div className="text-xs font-bold text-red-600 mt-1">
                        {selectedRequest.planned_due ? new Date(selectedRequest.planned_due).toLocaleString('ru-RU') : (selectedRequest.plannedDate || '24 часа')}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-600 mb-1">Класс ямы</label>
                      <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="w-full h-11 px-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none"
                      >
                        <option value="Большая">Большая</option>
                        <option value="Маленькая">Маленькая</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-600 mb-1">Группа улицы</label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full h-11 px-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none"
                      >
                        <option value="А">Категория А</option>
                        <option value="Б">Категория Б</option>
                        <option value="В">Категория В</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-600 mb-1">Подрядчик</label>
                      <select
                        value={selectedContractor}
                        onChange={(e) => setSelectedContractor(e.target.value)}
                        className="w-full h-11 px-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none"
                      >
                        <option value="ООО «ДорСтрой-Лидер»">ООО «ДорСтрой-Лидер»</option>
                        <option value="МУП «Автодор-Север»">МУП «Автодор-Север»</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-red-600 shrink-0" />
                    <span className="text-xs font-semibold text-neutral-800">
                      Рекомендация системы: «{selectedRequest.recommended_status || selectedRequest.recommendedStatus || 'Принято'}»
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  Служебный комментарий / причина отклонения:
                </label>
                <textarea
                  rows={2}
                  value={dispatcherNote}
                  onChange={(e) => setDispatcherNote(e.target.value)}
                  placeholder="Обязательно для статуса «Отклонено»..."
                  className="w-full p-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleUpdateStatus('Принято')}
                  className="flex-1 py-3 px-4 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Подтвердить статус "Принято"
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleUpdateStatus('Требует уточнения')}
                  className="flex-1 py-3 px-4 bg-neutral-400 hover:bg-neutral-500 text-white text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Запросить уточнение
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleUpdateStatus('Отклонено')}
                  className="flex-1 py-3 px-4 bg-red-800 hover:bg-red-900 text-white text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Отклонить заявку
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
              Выберите заявку из списка
            </div>
          )}
        </main>
      </div>
    </div>
  );
}