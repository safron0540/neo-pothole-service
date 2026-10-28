import { Children, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Выпадающий список вместо системного <select>: у системного список вариантов рисует
// браузер (синяя подсветка, прямоугольник без скруглений), его не оформить. Варианты
// передаются теми же <option>, поэтому замена <select> → <Dropdown> не меняет разметку вокруг.

interface OptionProps {
  value?: string | number;
  disabled?: boolean;
  children?: ReactNode;
}

interface DropdownProps {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  /** Классы самого поля: высота, рамка, фон, текст */
  className?: string;
  /** Классы обёртки: ширина и отступы снаружи */
  wrapperClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Иконка слева от текста */
  leading?: ReactNode;
  /** Стрелка справа: «arrow» — сплошная из макета фильтров, «chevron» — тонкая */
  arrow?: 'arrow' | 'chevron';
  /** Серый текст, пока не выбрано значение (вариант-заглушка с пустым value) */
  mutedWhenEmpty?: boolean;
}

export function Dropdown({
  value,
  onChange,
  children,
  className = '',
  wrapperClassName = 'relative inline-block',
  disabled = false,
  ariaLabel,
  leading,
  arrow = 'chevron',
  mutedWhenEmpty = false,
}: DropdownProps) {
  const options = Children.toArray(children)
    .filter((child): child is ReactElement<OptionProps> => isValidElement(child) && child.type === 'option')
    .map((child) => ({
      value: String(child.props.value ?? ''),
      label: child.props.children,
      disabled: Boolean(child.props.disabled),
    }));
  const current = options.find((o) => o.value === String(value)) ?? options[0];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  // Клик мимо, прокрутка страницы и смена размера окна закрывают список
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    const close = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  // Список рисуется поверх страницы (портал), поэтому его не обрезают модальные окна и
  // блоки с прокруткой. Если справа или снизу не хватает места — раскрывается влево или вверх.
  const openList = () => {
    const rect = root.current?.getBoundingClientRect();
    if (rect) {
      const width = 380;
      const below = window.innerHeight - rect.bottom;
      setPlace({
        position: 'fixed',
        minWidth: rect.width,
        ...(rect.left + width > window.innerWidth
          ? { right: Math.max(window.innerWidth - rect.right, 8) }
          : { left: rect.left }),
        ...(below < 240 && rect.top > below ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      });
    }
    setActive(Math.max(options.findIndex((o) => o.value === current?.value), 0));
    setOpen(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'Escape') return setOpen(false);
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      return openList();
    }
    if (!open) return;
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step) {
      event.preventDefault();
      let next = active;
      for (let i = 0; i < options.length; i++) {
        next = (next + step + options.length) % options.length;
        if (!options[next].disabled) break;
      }
      setActive(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    }
  };

  const muted = mutedWhenEmpty && !current?.value;

  return (
    <div ref={root} className={wrapperClassName}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full cursor-pointer items-center gap-2 text-left outline-none transition-colors disabled:cursor-not-allowed ${
          open ? '!border-red-700' : ''
        } ${className}`}
      >
        {leading}
        <span className={`min-w-0 flex-1 truncate ${muted ? 'text-neutral-500' : ''}`}>{current?.label}</span>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 transition-transform ${arrow === 'arrow' ? 'text-neutral-800' : 'text-neutral-600'} ${
            open ? 'rotate-180' : ''
          }`}
        >
          {arrow === 'arrow' ? (
            <path d="M1.5 4h9L6 9z" fill="currentColor" />
          ) : (
            <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </button>

      {open &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            style={place}
            className="z-[5000] max-h-72 w-max max-w-[min(90vw,380px)] overflow-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
          >
            {options.map((option, index) => {
              const selected = option.value === current?.value;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={option.disabled}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                    option.disabled
                      ? 'cursor-default text-neutral-300'
                      : `cursor-pointer ${index === active ? 'bg-neutral-100' : ''} ${
                          selected ? 'font-bold text-red-700' : 'text-neutral-800'
                        }`
                  }`}
                >
                  <span>{option.label}</span>
                  {selected && !option.disabled && (
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                      <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}
