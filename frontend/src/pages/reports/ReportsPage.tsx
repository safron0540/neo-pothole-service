import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Pagination } from '../../components/Pagination';
import { IconSelect } from '../../components/IconSelect';
import { Icon } from '../../components/Icon';

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

const PERIODS = ['Сентябрь 2026', 'Август 2026', 'Июль 2026', 'Май 2024', 'Апрель 2024'];

export default function ReportsPage() {
  const [reportType, setReportType] = useState<'count' | 'time'>('count');
  // Пустое значение = «не выбрано» (в готовом отчёте это «Все …»)
  const [period, setPeriod] = useState('');
  const [category, setCategory] = useState('');
  const [district, setDistrict] = useState('');
  const [contractor, setContractor] = useState('');
  const [isGenerated, setIsGenerated] = useState(false);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10; // как в макете: «Показано 10 из 10 записей»

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

  const filteredRows = useMemo(() => {
    const rows = MOCK_REPORT_DATA.filter(
      (r) =>
        (!category || `Категория ${r.group}` === category) &&
        (!district || districtOf(r) === district) &&
        (!contractor || r.contractor === contractor)
    );
    // Вкладка «Среднее время устранения» — самые долгие участки сверху
    return reportType === 'time' ? [...rows].sort((a, b) => b.avgTime - a.avgTime) : rows;
  }, [category, district, contractor, reportType]);

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
  const currentPage = Math.min(page, maxPage);
  const currentRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const fmt = (n: number) => n.toLocaleString('en-US');
  const fileName = `Отчёт_${period.replace(/\s+/g, '_')}.xlsx`;

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
    XLSX.writeFile(workbook, fileName);
  };

  const resetAll = () => {
    setPeriod('');
    setCategory('');
    setDistrict('');
    setContractor('');
    setPage(1);
    setIsGenerated(false);
  };

  const allCategories = isGenerated ? 'Все категории' : 'Выберите категорию...';
  const allDistricts = isGenerated ? 'Все районы' : 'Выберите район...';
  const allContractors = isGenerated ? 'Все подрядчики' : 'Выберите подрядчика...';

  const fields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold leading-[14px] text-neutral-600">
            Отчётный период <span className="text-red-700">*</span>
          </span>
          {!isGenerated && <span className="text-xs text-neutral-600">ДД.ММ.ГГГГ</span>}
        </div>
        <IconSelect iconName="field-calendar" ariaLabel="Отчётный период" value={period} onChange={setPeriod} placeholder="Выберите период...">
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </IconSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold leading-[14px] text-neutral-600">Категория улицы / группа</span>
        <IconSelect iconName="field-category" ariaLabel="Категория улицы" value={category} onChange={(v) => { setCategory(v); setPage(1); }} placeholder={allCategories}>
          <option value="Категория А">Категория А</option>
          <option value="Категория Б">Категория Б</option>
          <option value="Категория В">Категория В</option>
        </IconSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold leading-[14px] text-neutral-600">Административный округ</span>
        <IconSelect iconName="field-district" ariaLabel="Административный округ" value={district} onChange={(v) => { setDistrict(v); setPage(1); }} placeholder={allDistricts}>
          {districtOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </IconSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold leading-[14px] text-neutral-600">Подрядная организация</span>
        <IconSelect iconName="field-contractor" ariaLabel="Подрядная организация" value={contractor} onChange={(v) => { setContractor(v); setPage(1); }} placeholder={allContractors}>
          {contractorOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </IconSelect>
      </div>
    </div>
  );

  const tab = (id: 'count' | 'time', label: string, iconName: string) => {
    const active = reportType === id;
    return (
      <button
        type="button"
        onClick={() => { setReportType(id); setPage(1); }}
        className={`flex items-center gap-2 rounded-lg px-4 py-2 cursor-pointer transition-colors ${
          active ? 'bg-white shadow-[0_1px_1px_rgba(0,0,0,0.05)]' : 'hover:bg-white/60'
        }`}
      >
        {/* Горит только иконка активной вкладки, текст остаётся обычным */}
        <Icon name={iconName} className={`h-3.5 w-3.5 ${active ? 'text-red-700' : 'text-neutral-600'}`} />
        <span className={`text-xs font-light ${active ? 'text-neutral-800' : 'text-neutral-600'}`}>{label}</span>
      </button>
    );
  };

  // Макет «Веб/Отчеты»: поля 16, зазор между блоками 16
  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-neutral-100 text-neutral-800 antialiased p-4 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold leading-tight text-neutral-800">Аналитические отчёты</h1>
          <p className="text-sm text-neutral-600">Статистика выполнения заявок ямочного ремонта и соблюдения нормативных сроков</p>
        </div>

        <div className="flex items-center rounded-xl bg-neutral-100 p-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.15)]">
          {tab('count', 'Количество заявок', 'tab-chart')}
          {tab('time', 'Среднее время устранения', 'tab-timer')}
        </div>
      </div>

      {!isGenerated ? (
        <>
          <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="sliders" className="h-[15px] w-[15px] text-neutral-800" />
                <span className="text-sm font-bold text-neutral-800">Параметры выборки</span>
              </div>
              <button type="button" onClick={resetAll} className="flex items-center gap-1 text-[11px] font-bold text-neutral-600 hover:text-neutral-800 cursor-pointer">
                <Icon name="reset-small" className="h-3 w-3" />
                <span>Сбросить значения</span>
              </button>
            </div>

            {fields}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs text-neutral-600">
                <Icon name="info" className="h-[15px] w-[15px]" />
                <span>Обязательное условие для запуска расчета: выбор диапазона дат</span>
              </div>
              <button
                type="button"
                onClick={() => { setPage(1); setIsGenerated(true); }}
                disabled={!period}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white transition-colors ${
                  period ? 'bg-red-700 hover:bg-red-800 cursor-pointer' : 'bg-neutral-400 opacity-60 cursor-not-allowed'
                }`}
              >
                <Icon name="report-chart" className="h-[14px] w-[14px]" />
                <span>Сформировать отчёт</span>
              </button>
            </div>
          </div>

          <div className="flex min-h-[460px] flex-1 flex-col items-center justify-center rounded-xl bg-white px-8 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            {/* Плитка и оранжевый значок с воронкой уже нарисованы в файлах SVG */}
            <div className="relative mb-4">
              <Icon name="empty-reports" />
              <Icon name="badge-filter" className="absolute -bottom-2 -right-2" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-800">Задайте параметры и сформируйте отчёт</h2>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4 rounded-xl bg-white p-4 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
            <div className="min-w-[260px] flex-1">{fields}</div>
            <button
              type="button"
              onClick={resetAll}
              aria-label="Сбросить параметры"
              title="Сбросить параметры"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 hover:bg-neutral-200 cursor-pointer transition-colors"
            >
              <Icon name="reset-small" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setPage(1); setIsGenerated(true); }}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-red-700 px-6 text-sm font-bold text-white hover:bg-red-800 cursor-pointer transition-colors"
            >
              <Icon name="refresh" className="h-3 w-3" />
              <span>Сформировать</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-3 text-sm text-neutral-800">
              <Icon name="file" />
              <span>
                <span className="font-bold">Файл готов к скачиванию:</span> {fileName}
                <span className="ml-1 text-xs font-light text-neutral-600">(128 КБ)</span>
              </span>
            </div>
            <button type="button" onClick={handleExportExcel} className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-100 px-4 text-xs font-bold text-neutral-800 hover:bg-neutral-200 cursor-pointer transition-colors">
              <Icon name="download" className="h-3 w-3" />
              <span>Скачать файл</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex h-[88px] items-center justify-between rounded-xl bg-white px-5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.55px] text-neutral-600">Всего дефектов</div>
                <div className="text-[32px] font-bold leading-10 text-neutral-800">{fmt(totals.totalDefects)}</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                <Icon name="kpi-total" className="h-[15px] w-[15px]" />
              </div>
            </div>

            <div className="flex h-[88px] items-center justify-between rounded-xl bg-white px-5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.55px] text-neutral-600">Устранено в срок</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[32px] font-bold leading-10 text-red-700">{fmt(totals.inTime)}</span>
                  <span className="text-xs text-neutral-600">({totals.inTimePct}%)</span>
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-700">
                <Icon name="kpi-on-time" className="h-[18px] w-[18px]" />
              </div>
            </div>

            <div className="flex h-[88px] items-center justify-between rounded-xl bg-white px-5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.55px] text-neutral-600">Ср. время устранения</div>
                <div className="text-[32px] font-bold leading-10 text-neutral-800">{totals.avgTime} ч</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                <Icon name="kpi-time" className="h-[17px] w-[17px]" />
              </div>
            </div>
          </div>

          {/* Таблица: серая шапка #F5F5F5, серая строка «ИТОГО» и серая нижняя полоса с пагинацией */}
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="flex min-h-[69px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-700" />
                <h3 className="text-base font-bold text-neutral-800">Сводная ведомость по участкам</h3>
                <span className="ml-2 text-xs font-light text-neutral-600">{filteredRows.length} районов</span>
              </div>
              <button type="button" onClick={handleExportExcel} className="flex h-9 items-center gap-2 rounded-lg bg-neutral-100 px-4 text-xs font-bold text-neutral-800 hover:bg-neutral-200 cursor-pointer transition-colors">
                <Icon name="export-excel" className="h-[15px] w-[15px]" />
                <span>Экспорт в Excel (.xlsx)</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-100 text-xs font-bold uppercase leading-4 tracking-[0.6px] text-neutral-600">
                    <th className="px-4 py-3 text-center w-14">№</th>
                    <th className="px-4 py-3">Район / Округ</th>
                    <th className="px-4 py-3">Подрядчик</th>
                    <th className="px-4 py-3 text-right">Всего<br />дефектов</th>
                    <th className="px-4 py-3 text-right">Устранено в<br />срок</th>
                    <th className="px-4 py-3 text-right">Нарушение<br />срока</th>
                    <th className="px-4 py-3 text-right">Ср. время<br />(ч)</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-neutral-600">
                        По выбранным параметрам данных нет
                      </td>
                    </tr>
                  )}
                  {currentRows.map((row) => (
                    <tr key={row.number} className="border-b border-neutral-200 transition-colors hover:bg-neutral-100/50">
                      <td className="px-4 py-5 text-center text-neutral-600">{row.number}</td>
                      <td className="px-4 py-5 text-neutral-800">{row.district}</td>
                      <td className="px-4 py-5 text-neutral-800">{row.contractor}</td>
                      <td className="px-4 py-5 text-right text-neutral-800">{row.totalDefects}</td>
                      <td className="px-4 py-5 text-right font-bold text-red-700">{row.inTime}</td>
                      <td className="px-4 py-5 text-right font-bold text-red-700">{row.overdue}</td>
                      <td className={`px-4 py-5 text-right text-neutral-800 ${reportType === 'time' ? 'font-bold' : ''}`}>{row.avgTime}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-neutral-200 bg-neutral-100">
                    <td className="px-4 py-3.5 text-center text-sm font-bold text-neutral-600">∑</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-neutral-800">ИТОГО</td>
                    <td className="px-4 py-3.5 text-xs text-neutral-600">{totals.contractors} подрядчика</td>
                    <td className="px-4 py-3.5 text-right text-[15px] font-extrabold text-neutral-800">{fmt(totals.totalDefects)}</td>
                    <td className="px-4 py-3.5 text-right text-[15px] font-extrabold text-red-700">{fmt(totals.inTime)}</td>
                    <td className="px-4 py-3.5 text-right text-[15px] font-extrabold text-red-700">{fmt(totals.overdue)}</td>
                    <td className="px-4 py-3.5 text-right text-[15px] font-extrabold text-neutral-800">{totals.avgTime}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Pagination
              variant="footer"
              currentPage={currentPage}
              totalItems={filteredRows.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="записей"
              note="Данные сверены по ГОСТ Р 50597-2017"
            />
          </div>
        </>
      )}
    </div>
  );
}
