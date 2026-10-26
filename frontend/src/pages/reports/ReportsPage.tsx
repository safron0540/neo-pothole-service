import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  BarChart3, 
  Timer, 
  RotateCcw, 
  Calendar, 
  Route, 
  Building2, 
  HardHat, 
  FileSpreadsheet, 
  Download, 
  Check, 
  Clock, 
  TrendingUp 
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';

interface ReportRow {
  number: string;
  district: string;
  group: 'А' | 'Б' | 'В';
  contractor: string;
  totalDefects: number;
  inTime: number;
  overdue: number;
  avgTime: number;
}

const MOCK_REPORT_DATA: ReportRow[] = [
  { number: '01', group: 'А', district: 'Черемошники (Ленинский)', contractor: 'ООО «ДорСтрой-Лидер»', totalDefects: 186, inTime: 181, overdue: 5, avgTime: 16.2 },
  { number: '02', group: 'А', district: 'Каштак (Ленинский)', contractor: 'ООО «ДорСтрой-Лидер»', totalDefects: 210, inTime: 201, overdue: 9, avgTime: 17.8 },
  { number: '03', group: 'Б', district: 'Пески (Ленинский)', contractor: 'МУП «Автодор-Север»', totalDefects: 154, inTime: 142, overdue: 12, avgTime: 20.1 },
  { number: '04', group: 'Б', district: 'Татарская слобода (Советский)', contractor: 'МУП «Автодор-Север»', totalDefects: 98, inTime: 94, overdue: 4, avgTime: 15.5 },
  { number: '05', group: 'А', district: 'Академгородок (Советский)', contractor: 'ООО «Магистраль-Юг»', totalDefects: 142, inTime: 126, overdue: 16, avgTime: 23.4 },
  { number: '06', group: 'В', district: 'Нижняя Елань (Советский)', contractor: 'ООО «ДорСтрой-Лидер»', totalDefects: 164, inTime: 160, overdue: 4, avgTime: 14.8 },
  { number: '07', group: 'В', district: 'Мухин Бугор (Советский)', contractor: 'ООО «ДорСтрой-Лидер»', totalDefects: 62, inTime: 61, overdue: 1, avgTime: 13.2 },
  { number: '08', group: 'Б', district: 'Томск-II (Октябрьский)', contractor: 'ООО «Магистраль-Юг»', totalDefects: 112, inTime: 104, overdue: 8, avgTime: 21.0 },
  { number: '09', group: 'В', district: 'Степановка (Кировский)', contractor: 'ООО «Магистраль-Юг»', totalDefects: 54, inTime: 51, overdue: 3, avgTime: 19.2 },
  { number: '10', group: 'Б', district: 'Аникино (Кировский)', contractor: 'МУП «Автодор-Север»', totalDefects: 66, inTime: 63, overdue: 3, avgTime: 17.1 },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState<'count' | 'time'>('count');
  const [period, setPeriod] = useState('Май 2024');
  const [category, setCategory] = useState('Все категории');
  const [district, setDistrict] = useState('Все округа');
  const [contractor, setContractor] = useState('Все подрядчики');
  const [isGenerated, setIsGenerated] = useState(true);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  // Округ — это название в скобках: «Каштак (Ленинский)» → «Ленинский»
  const districtOf = (row: ReportRow) => row.district.match(/\(([^)]+)\)/)?.[1] ?? row.district;
  const districtOptions = useMemo(
    () => Array.from(new Set(MOCK_REPORT_DATA.map(districtOf))).sort((a, b) => a.localeCompare(b, 'ru')),
    []
  );
  const contractorOptions = useMemo(
    () => Array.from(new Set(MOCK_REPORT_DATA.map((r) => r.contractor))).sort((a, b) => a.localeCompare(b, 'ru')),
    []
  );

  const filteredRows = useMemo(
    () =>
      MOCK_REPORT_DATA.filter(
        (r) =>
          (category === 'Все категории' || `Категория ${r.group}` === category) &&
          (district === 'Все округа' || districtOf(r) === district) &&
          (contractor === 'Все подрядчики' || r.contractor === contractor)
      ),
    [category, district, contractor]
  );

  // Итоги считаются по выбранным строкам; среднее время — взвешенное по числу дефектов
  const totals = useMemo(() => {
    const totalDefects = filteredRows.reduce((sum, r) => sum + r.totalDefects, 0);
    const inTime = filteredRows.reduce((sum, r) => sum + r.inTime, 0);
    const overdue = filteredRows.reduce((sum, r) => sum + r.overdue, 0);
    const avgTime = totalDefects
      ? filteredRows.reduce((sum, r) => sum + r.avgTime * r.totalDefects, 0) / totalDefects
      : 0;
    return {
      totalDefects,
      inTime,
      overdue,
      avgTime: Math.round(avgTime * 10) / 10,
      inTimePct: totalDefects ? Math.round((inTime / totalDefects) * 1000) / 10 : 0,
      contractors: new Set(filteredRows.map((r) => r.contractor)).size,
    };
  }, [filteredRows]);

  const maxPage = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentRows = filteredRows.slice((Math.min(page, maxPage) - 1) * PAGE_SIZE, Math.min(page, maxPage) * PAGE_SIZE);
  const fmt = (n: number) => n.toLocaleString('ru-RU');

  const handleExportExcel = () => {
    const exportData = filteredRows.map((row) => ({
      '№': row.number,
      'Район / Округ': row.district,
      'Группа улицы': `Категория ${row.group}`,
      'Подрядчик': row.contractor,
      'Всего дефектов': row.totalDefects,
      'Устранено в срок': row.inTime,
      'Нарушение срока': row.overdue,
      'Ср. время (ч)': row.avgTime,
    }));

    exportData.push({
      '№': 'ИТОГО',
      'Район / Округ': `${totals.contractors} подрядчика`,
      'Группа улицы': '',
      'Подрядчик': '',
      'Всего дефектов': totals.totalDefects,
      'Устранено в срок': totals.inTime,
      'Нарушение срока': totals.overdue,
      'Ср. время (ч)': totals.avgTime,
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Сводная ведомость');
    XLSX.writeFile(workbook, `Отчёт_${period.replace(/\s+/g, '_') || 'Май_2024'}.xlsx`);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-neutral-100 text-neutral-800 antialiased p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Аналитические отчёты</h1>
          <p className="text-xs text-neutral-400 mt-1 font-light">
            Статистика выполнения заявок ямочного ремонта и соблюдения нормативных сроков
          </p>
        </div>

        <div className="bg-white rounded-2xl p-1.5 border border-neutral-200/80 shadow-sm flex items-center gap-1 text-xs">
          <button
            onClick={() => setReportType('count')}
            className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer transition-all ${
              reportType === 'count' ? 'bg-neutral-50 text-red-700 shadow-sm border border-neutral-200' : 'text-neutral-500 hover:text-black'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Количество заявок</span>
          </button>
          <button
            onClick={() => setReportType('time')}
            className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer transition-all ${
              reportType === 'time' ? 'bg-neutral-50 text-red-700 shadow-sm border border-neutral-200' : 'text-neutral-500 hover:text-black'
            }`}
          >
            <Timer className="w-4 h-4" />
            <span>Среднее время устранения</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">Параметры выборки</span>
          <button
            onClick={() => { setPeriod(''); setCategory('Все категории'); setDistrict('Все округа'); setContractor('Все подрядчики'); setPage(1); setIsGenerated(false); }}
            className="text-sm font-bold text-neutral-400 hover:text-neutral-800 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сбросить значения</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-600 mb-1.5 font-medium">
              <span>Отчётный период <span className="text-red-600">*</span></span>
              <span className="text-xs text-neutral-400">ДД.ММ.ГГГГ</span>
            </div>
            <div className="relative">
              <Calendar className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full h-11 pl-9 pr-4 text-xs bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-red-600 font-medium">
                <option value="">Выберите период...</option>
                <option value="Май 2024">Май 2024</option>
                <option value="Апрель 2024">Апрель 2024</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs text-neutral-600 mb-1.5 font-medium">Категория улицы / группа</div>
            <div className="relative">
              <Route className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
              <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="w-full h-11 pl-9 pr-4 text-xs bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-red-600 font-medium">
                <option value="Все категории">Все категории</option>
                <option value="Категория А">Категория А</option>
                <option value="Категория Б">Категория Б</option>
                <option value="Категория В">Категория В</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs text-neutral-600 mb-1.5 font-medium">Административный округ</div>
            <div className="relative">
              <Building2 className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
              <select value={district} onChange={(e) => { setDistrict(e.target.value); setPage(1); }} className="w-full h-11 pl-9 pr-4 text-xs bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-red-600 font-medium">
                <option value="Все округа">Все округа</option>
                {districtOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs text-neutral-600 mb-1.5 font-medium">Подрядная организация</div>
            <div className="relative">
              <HardHat className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
              <select value={contractor} onChange={(e) => { setContractor(e.target.value); setPage(1); }} className="w-full h-11 pl-9 pr-4 text-xs bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-red-600 font-medium">
                <option value="Все подрядчики">Все подрядчики</option>
                {contractorOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-neutral-100">
          <div className="text-xs text-neutral-400 font-light">ⓘ Обязательное условие: выбор диапазона дат</div>
          <button
            onClick={() => setIsGenerated(true)}
            disabled={!period}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              period ? 'bg-red-700 hover:bg-red-800 text-white cursor-pointer' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Сформировать отчёт</span>
          </button>
        </div>
      </div>

      {!isGenerated ? (
        <div className="flex-1 bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center justify-center mb-4 text-neutral-400">
            <TrendingUp className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-neutral-800">Задайте параметры и сформируйте отчёт</h3>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-neutral-200/80 px-6 py-3.5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3 text-xs text-neutral-600">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Файл готов к скачиванию:</span>
              <span className="font-bold text-neutral-900">Отчёт_{period.replace(/\s+/g, '_')}.xlsx</span>
            </div>
            <button onClick={handleExportExcel} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer">
              <Download className="w-4 h-4" />
              <span>Скачать файл</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 flex items-center justify-between shadow-sm">
              <div>
                <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Всего дефектов</div>
                <div className="text-3xl font-extrabold text-neutral-900 mt-1">{fmt(totals.totalDefects)}</div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 flex items-center justify-between shadow-sm">
              <div>
                <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Устранено в срок</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold text-red-700">{fmt(totals.inTime)}</span>
                  <span className="text-xs font-semibold text-neutral-500">({totals.inTimePct}%)</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center font-bold">
                <Check className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 flex items-center justify-between shadow-sm">
              <div>
                <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Ср. время устранения</div>
                <div className="text-3xl font-extrabold text-neutral-900 mt-1">{totals.avgTime} ч</div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-400">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                <h3 className="text-sm font-bold text-neutral-900">Сводная ведомость по участкам</h3>
                <span className="text-xs text-neutral-400 ml-2 font-light">{filteredRows.length} районов</span>
              </div>
              <button onClick={handleExportExcel} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Экспорт в Excel (.xlsx)</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-400 uppercase font-semibold text-xs tracking-wider pb-3">
                    <th className="py-3 px-3">№</th>
                    <th className="py-3 px-3">Район / Округ</th>
                    <th className="py-3 px-3">Подрядчик</th>
                    <th className="py-3 px-3 text-center">Всего дефектов</th>
                    <th className="py-3 px-3 text-center">Устранено в срок</th>
                    <th className="py-3 px-3 text-center">Нарушение срока</th>
                    <th className="py-3 px-3 text-right">Ср. время (ч)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {currentRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-neutral-400">
                        По выбранным параметрам данных нет
                      </td>
                    </tr>
                  )}
                  {currentRows.map((row) => (
                    <tr key={row.number} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3.5 px-3 text-neutral-400 font-medium">{row.number}</td>
                      <td className="py-3.5 px-3 font-semibold text-neutral-800">{row.district}</td>
                      <td className="py-3.5 px-3 text-neutral-600">{row.contractor}</td>
                      <td className="py-3.5 px-3 text-center font-medium text-neutral-700">{row.totalDefects}</td>
                      <td className="py-3.5 px-3 text-center font-bold text-red-700">{row.inTime}</td>
                      <td className="py-3.5 px-3 text-center font-bold text-red-600">{row.overdue}</td>
                      <td className="py-3.5 px-3 text-right font-medium text-neutral-700">{row.avgTime}</td>
                    </tr>
                  ))}
                  <tr className="bg-neutral-50 font-bold border-t-2 border-neutral-200 text-neutral-900">
                    <td className="py-4 px-3 text-base">Σ</td>
                    <td className="py-4 px-3">ИТОГО</td>
                    <td className="py-4 px-3 text-neutral-500 font-normal">{totals.contractors} подрядчика</td>
                    <td className="py-4 px-3 text-center">{fmt(totals.totalDefects)}</td>
                    <td className="py-4 px-3 text-center text-red-700">{fmt(totals.inTime)}</td>
                    <td className="py-4 px-3 text-center text-red-600">{fmt(totals.overdue)}</td>
                    <td className="py-4 px-3 text-right">{totals.avgTime}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={Math.min(page, maxPage)}
              totalItems={filteredRows.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="районов"
              note="Данные сверены по ГОСТ Р 50597-2017"
            />
          </div>
        </div>
      )}
    </div>
  );
}