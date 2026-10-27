import { useEffect, useState } from 'react';
import { api } from '../api';

// «Контакт подрядчика» — сотрудник-подрядчик из списка пользователей: «Соколов В.»
export function useContractorContacts(): Record<number, string> {
  const [contacts, setContacts] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    api
      .getUsers({ role: 'contractor', limit: 200 })
      .then((page) => {
        if (cancelled) return;
        const map: Record<number, string> = {};
        for (const u of page.items) {
          if (u.contractor_id != null && u.is_active && !(u.contractor_id in map)) {
            map[u.contractor_id] = `${u.last_name} ${u.first_name ? `${u.first_name[0]}.` : ''}`.trim();
          }
        }
        setContacts(map);
      })
      .catch(() => {
        /* без контактного лица — не критично */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return contacts;
}
