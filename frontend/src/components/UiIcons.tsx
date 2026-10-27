// Служебные значки, которых нет в макете (спиннер, закрытие, меню и т. п.). Рисуются прямо в коде,
// без внешних библиотек. Иконки из макета — компонент <Icon name="…" /> (см. src/assets/icons/README.md).
interface P {
  className?: string;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const Spinner = ({ className = '' }: P) => (
  <svg {...base} className={`animate-spin ${className}`}>
    <path d="M21 12a9 9 0 1 1-6.2-8.56" />
  </svg>
);

export const CloseIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const MenuIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const LogoutIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

export const PlusIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12h14" />
  </svg>
);

export const CameraIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

export const ImageOffIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="1.5" />
    <path d="m21 15-4.5-4.5L6 21M3 3l18 18" />
  </svg>
);

export const UserIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const HardHatIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <path d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M10 8V5h4v3" />
  </svg>
);

export const KeyIcon = ({ className = '' }: P) => (
  <svg {...base} className={className}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M16 7l3 3" />
  </svg>
);
