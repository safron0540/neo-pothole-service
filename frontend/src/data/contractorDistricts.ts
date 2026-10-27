import { useCallback, useState } from 'react';
import { IS_DEMO } from '../api';

// В контракте API v1 у подрядчика нет поля «район» (есть только зона-полигон), поэтому привязка
// «подрядчик → район» из экранов «Подрядчики и зоны» и «Управление подрядчиками» хранится в браузере.
// Когда в API появится поле, достаточно заменить load/save на запросы.
const KEY = 'contractor_districts';

export type ContractorDistricts = Record<number, number>; // id подрядчика → id района

// В демо-режиме показываем готовые привязки, как в макете
const DEMO_DEFAULT: ContractorDistricts = { 1: 2, 2: 3, 3: 1 };

function load(): ContractorDistricts {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ContractorDistricts;
  } catch {
    /* повреждённое значение — игнорируем */
  }
  return IS_DEMO ? { ...DEMO_DEFAULT } : {};
}

export function useContractorDistricts() {
  const [assignments, setAssignments] = useState<ContractorDistricts>(load);

  const save = useCallback((next: ContractorDistricts) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* хранилище недоступно — оставляем только в памяти */
    }
    setAssignments(next);
  }, []);

  return { assignments, save };
}
