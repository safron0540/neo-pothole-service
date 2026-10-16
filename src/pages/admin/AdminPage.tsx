import { useState } from 'react';
import { Clock, BookOpen, Building, Check, Pencil, Wrench, Truck, Tractor } from 'lucide-react';
import { Header } from '../../components/Header';
import { Pagination } from '../../components/Pagination';

interface StreetItem {
  id: number;
  name: string;
  district: string;
  category: 'Категория А' | 'Категория Б' | 'Категория В';
}

const MOCK_STREETS: StreetItem[] = [
  { id: 1, name: 'ул. Божова', district: 'Советский', category: 'Категория А' },
  { id: 2, name: 'Витимская', district: 'Ленинский', category: 'Категория А' },
  { id: 3, name: 'ул. Демьяна Белого', district: 'Ленинский', category: 'Категория Б' },
  { id: 4, name: 'ул. Весенняя', district: 'Кировский', category: 'Категория Б' },
  { id: 5, name: 'ул. Кулагина', district: 'Советский', category: 'Категория В' },
  { id: 6, name: 'пер. Богашевский', district: 'Советский', category: 'Категория В' },
];

export default function AdminPage() {
  const [activeSubTab, setActiveSubTab] = useState<'deadlines' | 'streets' | 'contractors'>('deadlines');
  const [deadlineA, setDeadlineA] = useState('24');
  const [deadlineB, setDeadlineB] = useState('24');
  const [deadlineV, setDeadlineV] = useState('24');

  const [streetsPage, setStreetsPage] = useState(1);
  const STREETS_PAGE_SIZE = 6;

  const [contractorDistricts, setContractorDistricts] = useState({ c1: '', c2: '', c3: '' });

  const handleSave = () => {
    alert('Параметры и справочники сохранены в БД!');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 font-sans text-neutral-800 antialiased">
      <Header />

      <div className="flex-1 overflow-y-auto px-8 pt-7 pb-10 flex flex-col justify-between">
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Справочники и параметры системы</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Управление классификатором улиц, нормативными сроками по ГОСТ Р 50597-2017 и зонами подрядчиков
            </p>
          </div>

          <div className="flex items-center gap-2 mb-6 border-b border-neutral-200 pb-2">
            <button
              onClick={() => setActiveSubTab('deadlines')}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                activeSubTab === 'deadlines' ? 'bg-white text-red-700 shadow-sm border border-neutral-200' : 'text-neutral-500 hover:text-black'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Сроки устранения по категориям</span>
            </button>

            <button
              onClick={() => setActiveSubTab('streets')}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                activeSubTab === 'streets' ? 'bg-white text-red-700 shadow-sm border border-neutral-200' : 'text-neutral-500 hover:text-black'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Улицы и районы</span>
            </button>

            <button
              onClick={() => setActiveSubTab('contractors')}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                activeSubTab === 'contractors' ? 'bg-white text-red-700 shadow-sm border border-neutral-200' : 'text-neutral-500 hover:text-black'
              }`}
            >
              <Building className="w-4 h-4" />
              <span>Подрядчики и зоны</span>
            </button>
          </div>

          {activeSubTab === 'deadlines' && (
            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-5">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">Нормативы устранения дефектов по ГОСТ Р 50597-2017</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Предельные сроки устранения ямочности</p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">КАТЕГОРИЯ «А»</span>
                    <span className="text-sm font-bold text-neutral-800">Магистральные трассы</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 font-medium">Время устранение дефекта</span>
                    <input
                      type="number"
                      value={deadlineA}
                      onChange={(e) => setDeadlineA(e.target.value)}
                      className="w-20 h-10 px-3 bg-white border border-neutral-300 rounded-xl text-sm font-bold text-center outline-none focus:border-red-600"
                    />
                    <span className="text-xs text-neutral-400">ч</span>
                  </div>
                </div>

                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="bg-[#B44C28] text-white text-xs font-bold px-3 py-1.5 rounded-lg">КАТЕГОРИЯ «Б»</span>
                    <span className="text-sm font-bold text-neutral-800">Районные магистрали</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 font-medium">Время устранение дефекта</span>
                    <input
                      type="number"
                      value={deadlineB}
                      onChange={(e) => setDeadlineB(e.target.value)}
                      className="w-20 h-10 px-3 border border-neutral-300 rounded-xl text-sm font-bold text-center outline-none focus:border-red-600"
                    />
                    <span className="text-xs text-neutral-400">ч</span>
                  </div>
                </div>

                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="bg-[#D9E2EC] text-[#334E68] text-xs font-bold px-3 py-1.5 rounded-lg">КАТЕГОРИЯ «В»</span>
                    <span className="text-sm font-bold text-neutral-800">Местное значение и проезды</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 font-medium">Время устранение дефекта</span>
                    <input
                      type="number"
                      value={deadlineV}
                      onChange={(e) => setDeadlineV(e.target.value)}
                      className="w-20 h-10 px-3 border border-neutral-300 rounded-xl text-sm font-bold text-center outline-none focus:border-red-600"
                    />
                    <span className="text-xs text-neutral-400">ч</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'streets' && (
            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-neutral-900">Классификатор улиц и распределение по районам</h2>
                <button onClick={() => alert('Форма добавления улицы')} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-semibold cursor-pointer">
                  + Добавить улицу
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-400 uppercase font-semibold text-[10px] tracking-wider pb-3">
                      <th className="py-3 px-3">Название улицы</th>
                      <th className="py-3 px-3">Район</th>
                      <th className="py-3 px-3">Категория дороги</th>
                      <th className="py-3 px-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {MOCK_STREETS.map((st) => (
                      <tr key={st.id} className="hover:bg-neutral-50/80 transition-colors">
                        <td className="py-3.5 px-3 font-bold text-neutral-900">{st.name}</td>
                        <td className="py-3.5 px-3 text-neutral-600 font-medium">{st.district}</td>
                        <td className="py-3.5 px-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white ${
                            st.category === 'Категория А' ? 'bg-red-700' : 'bg-[#B44C28]'
                          }`}>
                            {st.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <button className="text-neutral-400 hover:text-black cursor-pointer">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                currentPage={streetsPage}
                totalItems={1428}
                pageSize={STREETS_PAGE_SIZE}
                onPageChange={setStreetsPage}
                itemLabel="улиц"
              />
            </div>
          )}

          {activeSubTab === 'contractors' && (
            <div className="space-y-4">
              <div className="bg-white rounded-3xl border border-neutral-200/80 p-5 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <Wrench className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">ООО «ДорСтрой-Лидер»</h3>
                    <div className="text-xs text-neutral-400 mt-1">Контакт: Соколов В. П. • +7 (903) 124–55–88</div>
                  </div>
                </div>

                <div className="w-64">
                  <select
                    value={contractorDistricts.c1}
                    onChange={(e) => setContractorDistricts({ ...contractorDistricts, c1: e.target.value })}
                    className="w-full h-11 px-4 text-xs font-semibold bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                  >
                    <option value="">Выберите район...</option>
                    <option value="Ленинский">Ленинский район</option>
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-neutral-200/80 p-5 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">МУП «Автодор-Север»</h3>
                    <div className="text-xs text-neutral-400 mt-1">Контакт: Смирнов А. Н. • +7 (985) 674–12–90</div>
                  </div>
                </div>

                <div className="w-64">
                  <select
                    value={contractorDistricts.c2}
                    onChange={(e) => setContractorDistricts({ ...contractorDistricts, c2: e.target.value })}
                    className="w-full h-11 px-4 text-xs font-semibold bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                  >
                    <option value="">Выберите район...</option>
                    <option value="Октябрьский">Октябрьский район</option>
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-neutral-200/80 p-5 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <Tractor className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">ООО «Магистраль-Юг»</h3>
                    <div className="text-xs text-neutral-400 mt-1">Контакт: Кузнецов Д. И. • +7 (916) 120–09–33</div>
                  </div>
                </div>

                <div className="w-64">
                  <select
                    value={contractorDistricts.c3}
                    onChange={(e) => setContractorDistricts({ ...contractorDistricts, c3: e.target.value })}
                    className="w-full h-11 px-4 text-xs font-semibold bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                  >
                    <option value="">Выберите район...</option>
                    <option value="Кировский">Кировский район</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center pt-8">
          <button
            onClick={handleSave}
            className="px-8 py-3.5 bg-red-700 hover:bg-red-800 text-white rounded-2xl text-sm font-bold shadow-md flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Сохранить параметры</span>
          </button>
        </div>
      </div>
    </div>
  );
}