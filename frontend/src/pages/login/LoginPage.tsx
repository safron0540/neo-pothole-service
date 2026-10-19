import { useState, type FormEvent } from "react";
import { User, HardHat, Loader2 } from "lucide-react";
import logoImg from "../../assets/logo.svg";
import { api } from "../../api";

interface LoginPageProps {
  onLogin: (role: 'dispatcher' | 'contractor') => void;
}

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
      const response = await api.staffLogin(login, password);
      onLogin(response.role);
    } catch {
      // Резервный демо-вход при выключенном мок-сервере
      if (login.toLowerCase().includes("contractor") || login.toLowerCase().includes("voronov")) {
        onLogin('contractor');
      } else {
        onLogin('dispatcher');
      }
    } finally {
      setIsLoading(false);
    }
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

          <div className="w-full pt-4 border-t border-neutral-200 text-center">
            <div className="text-[11px] text-neutral-400 font-medium mb-2">
              Быстрый вход для проверки ролей (Демо):
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onLogin('dispatcher')}
                className="flex-1 py-2 px-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" />
                <span>Диспетчер (Иванова)</span>
              </button>
              <button
                type="button"
                onClick={() => onLogin('contractor')}
                className="flex-1 py-2 px-2 bg-orange-100 hover:bg-orange-200 text-orange-900 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <HardHat className="w-3.5 h-3.5" />
                <span>Подрядчик (Воронов)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}