import { useState, type FormEvent } from 'react';
import { User, HardHat, Loader2, KeyRound } from 'lucide-react';
import logoImg from '../../assets/logo.svg';
import { api, ApiError, IS_DEMO, DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../api';

interface LoginPageProps {
  onLogin: (role: 'dispatcher' | 'contractor') => void;
}

// Макет «Веб/Вход» (1366×768): карточка 460×537, #F5F5F5, радиус 22, отступы 41/66/47;
// поля 48 px (рамка 2 px #9E9E9E, радиус 12, тень), кнопка 187×43, радиус 12.
const fieldClass =
  'h-12 w-full rounded-xl border-2 border-neutral-400 bg-white px-[13px] text-sm font-normal text-neutral-800 shadow-[0_4px_8px_rgba(0,0,0,0.15)] outline-none placeholder:text-neutral-400 focus:border-red-700 transition-colors';

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!login.trim() || !password.trim()) {
      setErrorMessage('Введите логин и пароль');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.staffLogin(login.trim(), password);
      onLogin(response.role);
    } catch (err) {
      // message приходит с бэкенда по-русски («Неверный логин или пароль», «Слишком много попыток…»)
      setErrorMessage(err instanceof ApiError ? err.message : 'Не удалось войти: сервер недоступен');
    } finally {
      setIsLoading(false);
    }
  }

  function fillDemo(demoLogin: string) {
    setLogin(demoLogin);
    setPassword(DEMO_PASSWORD);
    setErrorMessage(null);
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white px-4 py-8">
      <div className="w-full max-w-[460px] rounded-[22px] bg-neutral-100 px-[66px] pb-[47px] pt-[41px]">
        <form onSubmit={onSubmit} className="flex w-full flex-col items-center gap-[79px]" noValidate>
          <div className="flex h-[90px] w-[334px] items-center drop-shadow-[0_4px_4px_rgba(0,0,0,0.15)]">
            <img src={logoImg} alt="Логотип NEO-СЕРВИС" className="h-[90px] w-[67px] shrink-0 object-contain" />
            <span className="ml-[10px] w-[256px] text-2xl font-bold leading-tight text-black">
              NEO-СЕРВИС: ЯМОЧНЫЙ РЕМОНТ
            </span>
          </div>

          <div className="flex w-full flex-col gap-[18px]">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-light text-neutral-800">Логин</span>
              <input
                type="text"
                placeholder="Введите логин"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className={fieldClass}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-light text-neutral-800">Пароль</span>
              <input
                type="password"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
              />
            </label>

            {errorMessage && <p className="text-xs font-normal text-red-700">{errorMessage}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-[43px] w-[187px] items-center justify-center rounded-xl bg-red-700 text-sm font-normal text-white shadow-[0_4px_4px_rgba(0,0,0,0.15)] transition-colors hover:bg-red-800 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Войти'}
          </button>
        </form>
      </div>

      {IS_DEMO && (
        <div className="w-full max-w-[460px] rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-light text-neutral-600">
            <KeyRound className="h-3.5 w-3.5" />
            <span>Демо-режим: данные в браузере, сервер не нужен. Нажмите, чтобы подставить логин и пароль</span>
          </div>
          <ul className="space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.login}>
                <button
                  type="button"
                  onClick={() => fillDemo(a.login)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                    login.trim() === a.login ? 'border-red-700 bg-red-50' : 'border-neutral-200 bg-white hover:bg-neutral-100'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      a.role === 'dispatcher' ? 'bg-neutral-200 text-neutral-700' : 'bg-orange-100 text-orange-800'
                    }`}
                  >
                    {a.role === 'dispatcher' ? <User className="h-4 w-4" /> : <HardHat className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-neutral-800">
                      {a.label} · {a.name}
                    </span>
                    <span className="block truncate text-xs font-light text-neutral-600">
                      {a.login} / {DEMO_PASSWORD}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
