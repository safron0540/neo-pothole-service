import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// ЛК-2, ЛК-3: хранение в UTC, показ в томском времени (UTC+7), ДД.ММ.ГГГГ и ЧЧ:ММ.
// Фиксированное смещение: не зависит от часового пояса телефона и от Intl.
const TOMSK_OFFSET_MIN = 7 * 60;
const toTomsk = (iso: string) => dayjs.utc(iso).utcOffset(TOMSK_OFFSET_MIN);

export const formatDate = (iso: string) => toTomsk(iso).format('DD.MM.YYYY');
export const formatTime = (iso: string) => toTomsk(iso).format('HH:mm');
