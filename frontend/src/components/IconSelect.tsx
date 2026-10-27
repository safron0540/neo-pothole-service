import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface IconSelectProps {
  /** Имя иконки из макета (src/assets/icons), например field-calendar */
  iconName: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}

// Поле выбора по макету: серая заливка #F5F5F5, высота 44, радиус 12, иконка слева, шеврон справа
export function IconSelect({ iconName, value, onChange, placeholder, ariaLabel, children, className = '' }: IconSelectProps) {
  return (
    <div className={`relative ${className}`}>
      <Icon name={iconName} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 w-full cursor-pointer appearance-none truncate rounded-xl bg-neutral-100 pl-10 pr-9 text-sm outline-none focus:ring-1 focus:ring-red-700 ${
          value ? 'text-neutral-800' : 'text-neutral-600'
        }`}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <Icon name="chevron-down" className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
    </div>
  );
}
