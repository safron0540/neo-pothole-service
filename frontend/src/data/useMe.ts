import { useEffect, useState } from 'react';
import { api } from '../api';
import type { MeOut } from '../api';

export const shortName = (me: MeOut | null): string =>
  me ? `${me.last_name} ${me.first_name ? `${me.first_name[0]}.` : ''}`.trim() : '…';

export function useMe() {
  const [me, setMe] = useState<MeOut | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((data) => !cancelled && setMe(data))
      .catch(() => {
        /* имя в шапке — не критично */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return me;
}
