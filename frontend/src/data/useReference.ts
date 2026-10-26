import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { ContractorOut, DistrictOut, StreetGroupOut } from '../api';

export interface Reference {
  districts: DistrictOut[];
  streetGroups: StreetGroupOut[];
  contractors: ContractorOut[];
}

const EMPTY: Reference = { districts: [], streetGroups: [], contractors: [] };

// Справочники меняются редко — грузим один раз на сессию и делим между страницами
let cache: Reference | null = null;
let pending: Promise<Reference> | null = null;

function loadReference(force = false): Promise<Reference> {
  if (cache && !force) return Promise.resolve(cache);
  if (pending) return pending;
  pending = Promise.all([api.getDistricts(), api.getStreetGroups(), api.getContractors()])
    .then(([districts, streetGroups, contractors]) => {
      cache = { districts, streetGroups, contractors };
      return cache;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function resetReferenceCache() {
  cache = null;
}

export function useReference() {
  const [data, setData] = useState<Reference | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    loadReference()
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // После правок в админке перечитываем справочники
  const reload = useCallback(async () => {
    try {
      setData(await loadReference(true));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const ref = data ?? EMPTY;
  return {
    districts: ref.districts,
    streetGroups: ref.streetGroups,
    contractors: ref.contractors,
    isLoading: data === null && error === null,
    error,
    reload,
  };
}
