import type { ReactNode } from 'react';
import { Icon } from './Icon';


interface SelectBoxProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  /** Классы обёртки (ширина, отступы) */
  className?: string;
  /** Классы самого поля (цвет, рамка, текст) — перекрывают стандартные */
  fieldClassName?: string;
}

// Выпадающий список по макету: серая рамка #9E9E9E, радиус 12, сплошная стрелка вниз справа
export function SelectBox({
  value,
  onChange,
  children,
  ariaLabel,
  disabled,
  className = '',
  fieldClassName = '',
}: SelectBoxProps) {
  return (
    <span className={`relative inline-block ${className}`}>
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`h-full w-full cursor-pointer appearance-none truncate rounded-xl border border-neutral-400 bg-white py-1.5 pl-3 pr-9 text-sm font-normal text-neutral-800 outline-none transition-colors focus:border-red-700 disabled:cursor-not-allowed disabled:bg-neutral-100 ${fieldClassName}`}
      >
        {children}
      </select>
      <Icon
        name="arrow-down"
        className="pointer-events-none absolute right-3 top-1/2 h-[9px] w-[15px] -translate-y-1/2 text-neutral-800"
      />
    </span>
  );
}
