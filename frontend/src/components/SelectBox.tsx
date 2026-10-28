import type { ReactNode } from 'react';
import { Dropdown } from './Dropdown';

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
  /** Стрелка: сплошная из макета (по умолчанию) или тонкая — для компактных фильтров */
  arrow?: 'arrow' | 'chevron';
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
  arrow = 'arrow',
}: SelectBoxProps) {
  return (
    <Dropdown
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      disabled={disabled}
      arrow={arrow}
      wrapperClassName={`relative inline-block ${className}`}
      className={`h-full rounded-xl border border-neutral-400 bg-white py-1.5 pl-3 pr-3 text-sm font-normal text-neutral-800 hover:border-neutral-600 disabled:bg-neutral-100 ${fieldClassName}`}
    >
      {children}
    </Dropdown>
  );
}
