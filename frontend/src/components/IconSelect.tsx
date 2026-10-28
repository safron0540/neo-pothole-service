import type { ReactNode } from 'react';
import { Dropdown } from './Dropdown';
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
    <Dropdown
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      mutedWhenEmpty
      wrapperClassName={`relative ${className}`}
      className="h-11 rounded-xl border border-transparent bg-neutral-100 px-3 text-sm text-neutral-800 hover:bg-neutral-200/70"
      leading={<Icon name={iconName} className="h-4 w-4 shrink-0 text-neutral-600" />}
    >
      <option value="">{placeholder}</option>
      {children}
    </Dropdown>
  );
}
