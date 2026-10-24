import { useState, type FormEvent } from "react";
import { User, HardHat, Loader2, KeyRound } from "lucide-react";
import logoImg from "../../assets/logo.svg";
import { api, ApiError } from "../../api";

interface LoginPageProps {
  onLogin: (role: 'dispatcher' | 'contractor') => void;
}

// Демо-учётки: роль определяется логином, а не отдельной кнопкой «войти как…»
const DEMO_ACCOUNTS = [
  { role: 'dispatcher' as const, label: 'Диспетчер', name: 'Иванова Е. А.', login: 'ivanova@service.ru', password: 'demo1234' },
  { role: 'contractor' as const, label: 'Подрядчик', name: 'Воронов А. С.', login: 'voronov@service.ru', password: 'demo1234' },
];

const fieldClass =
  "h-12 w-full rounded-xl border-2 border-neutral-400 bg-white px-4 text-sm text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400 focus:border-red-700 transition-colors";

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!login.trim() || !password.trim()) {
      setErrorMessage("Введите логин и пароль");
      return;
    }

    setIsLoading(true);
    try {
      const demo = DEMO_ACCOUNTS.find(
        (a) => a.login === login.trim().toLowerCase() && a.password === password
      );
      if (demo) {
        onLogin(demo.role);
        return;
      }
      const response = await api.staffLogin(login.trim(), password);
      onLogin(response.role);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError && (err.status === 401 || err.status === 403)
          ? 'Неверный логин или пароль'
          : 'Не удалось войти: сервер недоступен'
      );
    } finally {
      setIsLoading(false);
    }
  }

  function fillDemo(a: (typeof DEMO_ACCOUNTS)[number]) {
    setLogin(a.login);
    setPassword(a.password);
    setErrorMessage(null);
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-neutral-200 px-4 py-8">
      <div className="w-full max-w-md rounded-3xl bg-neutral-50 px-6 py-10 sm:px-12 shadow-sm border border-neutral-200">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center justify-center gap-3">
            <img 
              src={logoImg} 
              alt="Логотип NEO-СЕРВИС" 
              className="h-14 w-auto object-contain shrink-0" 
            />
            <span className="text-xl font-bold leading-tight text-neutral-900 tracking-wide text-left">
              NEO-СЕРВИС:<br />ЯМОЧНЫЙ РЕМОНТ
            </span>
          </div>

          <form onSubmit={onSubmit} className="flex w-full flex-col items-center gap-4">
            <div className="flex w-full flex-col gap-3">
              <label className="flex flex-col gap-1 text-left">
                <span className="text-xs font-medium text-neutral-700">Логин</span>
                <input
                  type="text"
                  placeholder="ivanova@service.ru"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className={fieldClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-left">
                <span className="text-xs font-medium text-neutral-700">Пароль</span>
                <input
                  type="password"
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>

            {errorMessage && (
              <p className="text-xs font-medium text-red-600">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex h-11 w-44 items-center justify-center rounded-xl bg-red-700 text-sm font-medium text-white shadow-md transition-colors hover:bg-red-800 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Войти"}
            </button>
          </form>

          <div className="w-full pt-4 border-t border-neutral-200">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-medium mb-2">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Демо-доступ — нажмите, чтобы подставить логин и пароль</span>
            </div>
            <ul className="space-y-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.role}>
                  <button
                    type="button"
                    onClick={() => fillDemo(a)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                      login.trim().toLowerCase() === a.login
                        ? 'border-red-600 bg-red-50'
                        : 'border-neutral-200 bg-white hover:bg-neutral-100'
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${a.role === 'dispatcher' ? 'bg-neutral-200 text-neutral-700' : 'bg-orange-100 text-orange-800'}`}>
                      {a.role === 'dispatcher' ? <User className="w-4 h-4" /> : <HardHat className="w-4 h-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-neutral-800">{a.label} · {a.name}</span>
                      <span className="block text-[11px] text-neutral-400 truncate">{a.login}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}