// Ошибки API приходят как {code, message, details}; ветвимся по code, показываем message.
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Нет связи или сервер не ответил вовремя (не ответ сервера). */
  get isNetwork() {
    return this.code === 'network' || this.code === 'timeout';
  }
}

export const errorMessage = (e: unknown, fallback = 'Что-то пошло не так. Попробуйте ещё раз.') =>
  e instanceof ApiError ? e.message : fallback;
